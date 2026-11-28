// Company bills paid online (FUNCTIONALITY.md section 11): one Paystack charge, one payment and receipt per booking.
import { describe, expect, it } from "vitest";
import { createBill, getBill } from "@/server/domain/bills";
import { beginBillPayment, billChargeParts, billLinkView, createBillPayLink } from "@/server/domain/pay-links";
import { applyPaystackResult, paymentsToSweep } from "@/server/domain/payments";
import { day, db, desk, exec, insertReservation, iso, makeCategory, q, rejects, status } from "./helpers";

const SITE = "https://victorialuxuryhotel.com";

async function billOfTwo() {
  const c = await makeCategory(2, { rateKobo: 8_500_000 });
  const ids = await Promise.all([0, 1].map(() => insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6), rateKobo: 8_500_000, holdMinutes: 60 })));
  const { id } = await createBill(db, desk, { companyName: "Zenith", reservationIds: ids, validUntil: day(3) });
  return { id, ids };
}

describe("company bills paid online", () => {
  it("one charge for what's owed, split into a payment and receipt per booking when Paystack confirms it", async () => {
    const { id, ids } = await billOfTwo();
    const link = await createBillPayLink(db, desk, id, SITE);
    expect(link.url).toBe(`${SITE}/pay/${link.code}`);
    expect(await billLinkView(db, link.code)).toMatchObject({ state: "open", amountKobo: 17_000_000 });
    await rejects(beginBillPayment(db, link.code, "nope"), /Enter an email/);
    const charge = await beginBillPayment(db, link.code, "accounts@zenith.example");
    expect(charge.amountKobo).toBe(17_000_000);
    const parts = (await billChargeParts(db, charge.reference))!;
    expect(parts.parts.map((p) => p.amountKobo)).toEqual([8_500_000, 8_500_000]);
    // The sweep asks Paystack about the charge once, not about each part.
    const swept = await paymentsToSweep(db, Date.now() + 31 * 60_000);
    expect(swept.filter((r) => r.startsWith(charge.reference))).toEqual([charge.reference]);
    for (const p of parts.parts) {
      await applyPaystackResult(db, { reference: p.reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: iso(0), channel: "card", gatewayResponse: "Approved" });
    }
    for (const r of ids) expect(await status(r)).toBe("confirmed");
    const receipts = await q<{ receipt_number: string }>("SELECT receipt_number FROM payments WHERE provider_reference LIKE ? AND status = 'successful'", `${charge.reference}-%`);
    expect(new Set(receipts.map((r) => r.receipt_number)).size).toBe(2);
    expect((await getBill(db, desk, id))!.owedKobo).toBe(0);
    expect(await billLinkView(db, link.code)).toMatchObject({ state: "paid" });
  });

  it("a new link replaces the old; links end with the bill's valid-until date", async () => {
    const { id } = await billOfTwo();
    const a = await createBillPayLink(db, desk, id, SITE);
    const b = await createBillPayLink(db, desk, id, SITE);
    expect(await billLinkView(db, a.code)).toEqual({ state: "closed", reason: "cancelled" });
    await exec("UPDATE pay_links SET expires_at = ? WHERE code = ?", iso(-1000), b.code);
    expect(await billLinkView(db, b.code)).toEqual({ state: "closed", reason: "expired" });
    await rejects(beginBillPayment(db, b.code, "a@b.co"), /link has ended/);
  });
});
