import { describe, expect, it } from "vitest";
import { addExtra, addPromo } from "@/server/domain/admin";
import { applyPaystackResult, beginPaystackPayment } from "@/server/domain/payments";
import { changeReservationDates, createWebsiteReservation } from "@/server/domain/reservations";
import { day, db, desk, gm, iso, makeCategory, q1, rejects, status } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 6).toUpperCase();

async function book(extraIds: string[] = [], promoCode: string | null = null, nights = 2) {
  const c = await makeCategory(2, { rateKobo: 5_500_000 });
  const r = await createWebsiteReservation(db, {
    categorySlug: c.slug, checkIn: day(40), checkOut: day(40 + nights), guests: 1, fullName: "Extra Guest",
    email: `x-${rand().toLowerCase()}@example.com`, phone: "+2348000000003", extraIds, promoCode,
  });
  return { ...r, category: c };
}

describe("extras and promo codes", () => {
  it("prices extras per stay or per night, takes the promo off the room only, and Paystack charges the amount due", async () => {
    const pickup = await addExtra(db, gm, { name: `Pickup ${rand()}`, priceKobo: 1_500_000, perNight: false });
    const breakfast = await addExtra(db, gm, { name: `Breakfast ${rand()}`, priceKobo: 500_000, perNight: true });
    const code = `TEN${rand()}`;
    await addPromo(db, gm, { code, percentOff: 10, validUntil: null, maxUses: 5 });
    const b = await book([pickup, breakfast], code.toLowerCase());
    const r = await q1<{ total_amount_kobo: number; extras_kobo: number; discount_kobo: number; promo_code: string }>(
      "SELECT total_amount_kobo, extras_kobo, discount_kobo, promo_code FROM reservations WHERE id = ?", b.id);
    expect(r).toEqual({ total_amount_kobo: 11_000_000, extras_kobo: 2_500_000, discount_kobo: 1_100_000, promo_code: code });
    expect(b.totalAmountKobo).toBe(12_400_000);
    expect((await q1<{ used_count: number }>("SELECT used_count FROM promo_codes WHERE code = ?", code)).used_count).toBe(1);

    const p = await beginPaystackPayment(db, b.publicToken);
    expect(p.amountKobo).toBe(12_400_000);
    expect(await applyPaystackResult(db, { reference: p.reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: iso(0), channel: "card", gatewayResponse: "ok" })).toBe("confirmed");
    expect(await status(b.id)).toBe("confirmed");

    await changeReservationDates(db, desk, b.id, day(40), day(43));
    expect(await q1("SELECT total_amount_kobo, extras_kobo, discount_kobo FROM reservations WHERE id = ?", b.id)).toEqual({
      total_amount_kobo: 16_500_000, extras_kobo: 3_000_000, discount_kobo: 1_650_000,
    });
  });

  it("refuses unknown, switched-off, expired and used-up codes", async () => {
    await rejects(book([], "NOPE-NOT-REAL"), /isn't valid/);
    const once = `ONCE${rand()}`;
    await addPromo(db, gm, { code: once, percentOff: 5, validUntil: null, maxUses: 1 });
    await book([], once);
    await rejects(book([], once), /fully used/);
    const old = `OLD${rand()}`;
    await addPromo(db, gm, { code: old, percentOff: 5, validUntil: day(-1), maxUses: null });
    await rejects(book([], old), /expired/);
  });

  it("only managers create extras and codes", async () => {
    await rejects(addExtra(db, desk, { name: "Nope", priceKobo: 100, perNight: false }), /role does not allow/);
    await rejects(addPromo(db, desk, { code: "DESKCODE", percentOff: 50, validUntil: null, maxUses: null }), /role does not allow/);
  });
});
