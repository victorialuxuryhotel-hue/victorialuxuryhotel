// Company bills, paid before arrival (FUNCTIONALITY.md section 11).
import { describe, expect, it } from "vitest";
import { cancelBill, createBill, getBill, payBill } from "@/server/domain/bills";
import { createBillPayLink } from "@/server/domain/pay-links";
import { netPaid } from "@/server/domain/reservations";
import { day, db, desk, insertReservation, makeCategory, q, q1, rejects, status } from "./helpers";

async function threeRooms() {
  const c = await makeCategory(3, { rateKobo: 8_500_000 });
  return Promise.all([0, 1, 2].map(() => insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(7), rateKobo: 8_500_000, holdMinutes: 60 })));
}

describe("company bills", () => {
  it("numbers bills B-0001…, totals the bookings, holds them until valid-until, and says it's not a receipt", async () => {
    const ids = await threeRooms();
    const a = await createBill(db, desk, { companyName: "Zenith Bank Plc, Akure branch", attention: "Mrs T. Ade", reservationIds: ids, validUntil: day(3) });
    const b = await createBill(db, desk, { companyName: "Another Co", reservationIds: [(await threeRooms())[0]!], validUntil: day(2) });
    expect(a.number).toMatch(/^B-\d{4}$/);
    expect(Number(b.number.slice(2))).toBe(Number(a.number.slice(2)) + 1);
    const bill = (await getBill(db, desk, a.id))!;
    expect(bill.totalKobo).toBe(3 * 2 * 8_500_000);
    expect(bill.lines[0]).toMatchObject({ quantity: 6, rateKobo: 8_500_000, amountKobo: 51_000_000 });
    for (const id of ids) {
      const h = await q1<{ hold_expires_at: string }>("SELECT hold_expires_at FROM reservations WHERE id = ?", id);
      expect(h.hold_expires_at.slice(0, 10) >= day(3)).toBe(true);
    }
    await rejects(createBill(db, desk, { companyName: "Dup", reservationIds: [ids[0]!], validUntil: day(3) }), /already on bill/);
    await rejects(createBill(db, desk, { companyName: "Late", reservationIds: [(await threeRooms())[0]!], validUntil: day(9) }), /on or before/);
  });

  it("a payment is split across the bookings in order, each with its own receipt", async () => {
    const ids = await threeRooms();
    const { id } = await createBill(db, desk, { companyName: "Zenith", reservationIds: ids, validUntil: day(3) });
    await rejects(payBill(db, desk, id, { amountKobo: 51_000_001, method: "cash", paidOn: day(0), confirmReceived: true }), /Only ₦510,000 is owed/);
    const r = await payBill(db, desk, id, { amountKobo: 25_500_000, method: "bank_transfer", reference: "ZEN-7781", paidOn: day(0), confirmReceived: true });
    expect(r.receipts.map((x) => x.amountKobo)).toEqual([17_000_000, 8_500_000]);
    expect(new Set(r.receipts.map((x) => x.receiptNumber)).size).toBe(2);
    expect(await status(ids[0]!)).toBe("confirmed");
    expect(await netPaid(db, ids[1]!)).toBe(8_500_000);
    expect(await netPaid(db, ids[2]!)).toBe(0);
    expect((await getBill(db, desk, id))!.owedKobo).toBe(25_500_000);
    // Paying the rest marks the bill's payment link paid.
    const link = await createBillPayLink(db, desk, id, "https://victorialuxuryhotel.com");
    await payBill(db, desk, id, { amountKobo: 25_500_000, method: "cash", paidOn: day(0), confirmReceived: true });
    expect((await q1<{ paid_payment_id: string | null }>("SELECT paid_payment_id FROM pay_links WHERE code = ?", link.code)).paid_payment_id).not.toBeNull();
  });

  it("a bill can't be changed or deleted; cancelling is final; only front desk and up make bills", async () => {
    const ids = await threeRooms();
    const { id } = await createBill(db, desk, { companyName: "Zenith", reservationIds: ids, validUntil: day(3) });
    await rejects(q("UPDATE bills SET total_kobo = 1 WHERE id = ?", id), /bill_fixed/);
    await rejects(q("DELETE FROM bills WHERE id = ?", id), /history_immutable/);
    await cancelBill(db, desk, id);
    await rejects(cancelBill(db, desk, id), /already cancelled/);
    await rejects(payBill(db, desk, id, { amountKobo: 100, method: "cash", paidOn: day(0), confirmReceived: true }), /cancelled/);
    await rejects(createBill(db, { id: desk!.id, role: "restaurant_bar" }, { companyName: "X", reservationIds: ids, validUntil: day(3) }), /role can't do this/);
  });
});
