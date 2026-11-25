// Interface brief I1: payments to confirm.
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { createHallBooking, recordHallPayment } from "@/server/domain/events";
import { checkPayment, paymentsToConfirm, toConfirmSummary } from "@/server/domain/payment-checks";
import { recordOfflinePayment } from "@/server/domain/payments";
import { payOrder, saveMenuItem } from "@/server/domain/pos";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, q1, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 8);
const fin: Actor = { id: owner!.id, role: "finance" };

async function deskPayment(method: "cash" | "bank_transfer" | "pos_terminal", reference: string | null) {
  const c = await makeCategory(1, { rateKobo: 5_000_000 });
  const r = await insertReservation({ categoryId: c.id, checkIn: day(60), checkOut: day(61), rateKobo: 5_000_000 });
  const { paymentId } = await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method, reference, paidOn: day(0), confirmReceived: true });
  return { reservationId: r, paymentId };
}
const listed = async (sourceId: string) => (await paymentsToConfirm(db, gm)).find((x) => x.source_id === sourceId);

describe("payments to confirm", () => {
  it("lists every staff-taken transfer and POS payment (desk, hall, bar), not cash or Paystack", async () => {
    const transfer = await deskPayment("bank_transfer", `GTB ${rand()}`);
    const pos = await deskPayment("pos_terminal", "4821");
    const cash = await deskPayment("cash", null);
    const hall = await createHallBooking(db, gm, { title: "Check", customerName: "Acme", phone: null, email: null, guests: 5, priceKobo: 2_000_000, notes: null, eventDate: day(200 + Math.floor(Math.random() * 300)), startTime: "08:00", endTime: "09:00" });
    const hallPaymentId = crypto.randomUUID();
    await recordHallPayment(db, gm, { bookingId: hall, amountKobo: 1_000_000, method: "bank_transfer", paidOn: day(0), reference: `TRF ${rand()}`, paymentId: hallPaymentId });
    const seller: Actor = { id: owner!.id, role: "owner" };
    const item = await saveMenuItem(db, seller, { name: `Zobo ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 100_000, available: true, active: true });
    const bar = await payOrder(db, seller, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: item, quantity: 1 }], method: "pos_terminal", paymentReference: "7731" });

    expect(await listed(transfer.paymentId)).toMatchObject({ source_type: "payment", method: "bank_transfer", amount_kobo: 5_000_000 });
    expect(await listed(pos.paymentId)).toMatchObject({ method: "pos_terminal", reference: "4821" });
    expect(await listed(cash.paymentId)).toBeUndefined();
    expect(await listed(hallPaymentId)).toMatchObject({ source_type: "hall_payment" });
    expect(await listed(bar.id)).toMatchObject({ source_type: "pos_order", reference: "7731" });

    const list = await paymentsToConfirm(db, fin);
    const sum = await toConfirmSummary(db, fin);
    expect(sum).toEqual({ count: list.length, kobo: list.reduce((t, r) => t + r.amount_kobo, 0) });
  });

  it("Matches takes it off the list, once; the check can't be changed or deleted", async () => {
    const { paymentId } = await deskPayment("bank_transfer", `GTB ${rand()}`);
    await checkPayment(db, gm, { sourceType: "payment", sourceId: paymentId, outcome: "matched" });
    expect(await listed(paymentId)).toBeUndefined();
    await rejects(checkPayment(db, owner, { sourceType: "payment", sourceId: paymentId, outcome: "matched" }), /already checked/, "CONFLICT");
    await rejects(exec("UPDATE payment_checks SET outcome = 'not_found' WHERE source_id = ?", paymentId), /payment_check_immutable/);
    await rejects(exec("DELETE FROM payment_checks WHERE source_id = ?", paymentId), /payment_check_immutable/);
  });

  it("Not found needs a note and flags the booking for a correction", async () => {
    const { paymentId, reservationId } = await deskPayment("bank_transfer", `GTB ${rand()}`);
    await rejects(checkPayment(db, gm, { sourceType: "payment", sourceId: paymentId, outcome: "not_found", note: "no" }), /Say what you checked/);
    await checkPayment(db, gm, { sourceType: "payment", sourceId: paymentId, outcome: "not_found", note: "Not on the GTB statement for today" });
    expect((await q1<{ a: string }>("SELECT attention_reason AS a FROM reservations WHERE id = ?", reservationId)).a).toMatch(/wasn't found on the statement/);
    expect((await q1<{ n: number }>("SELECT count(*) AS n FROM activity_log WHERE action = 'payment.not_found' AND entity_id = ?", paymentId)).n).toBe(1);
  });

  it("only the General Manager or Owner confirms; finance reads the list", async () => {
    const { paymentId } = await deskPayment("pos_terminal", "1234");
    await rejects(checkPayment(db, fin, { sourceType: "payment", sourceId: paymentId, outcome: "matched" }), /role can't do this/, "FORBIDDEN");
    await rejects(checkPayment(db, desk, { sourceType: "payment", sourceId: paymentId, outcome: "matched" }), /role can't do this/, "FORBIDDEN");
    await rejects(
      exec("INSERT INTO payment_checks (id, source_type, source_id, outcome, checked_by) VALUES (?, 'payment', ?, 'matched', ?)", crypto.randomUUID(), paymentId, desk!.id),
      /payment_check_forbidden/,
    );
    expect(Array.isArray(await paymentsToConfirm(db, fin))).toBe(true);
    await rejects(paymentsToConfirm(db, desk), /role can't do this/, "FORBIDDEN");
  });
});
