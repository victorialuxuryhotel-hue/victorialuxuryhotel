// Payment links and the guest's pay page (FUNCTIONALITY.md section 10).
import { describe, expect, it } from "vitest";
import { createPayLink, payLinkView, tokenForPayment } from "@/server/domain/pay-links";
import { beginPaystackPayment, recordOfflinePayment } from "@/server/domain/payments";
import { expireUnpaidReservations } from "@/server/domain/reservations";
import { day, db, desk, exec, insertReservation, iso, makeCategory, makeGuest, q1, rejects, status } from "./helpers";

const SITE = "https://victorialuxuryhotel.com";

async function unpaid(opts: { email?: string | null; holdMinutes?: number } = {}) {
  const c = await makeCategory(1, { rateKobo: 5_000_000 });
  const guestId = await makeGuest(opts.email === undefined ? `g-${crypto.randomUUID().slice(0, 6)}@example.com` : opts.email);
  return insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(11), rateKobo: 5_000_000, guestId, holdMinutes: opts.holdMinutes ?? 120 });
}

describe("payment links", () => {
  it("the desk makes a random link for what's owed, expiring with the hold; the message has the link", async () => {
    const r = await unpaid();
    const l = await createPayLink(db, desk, r, SITE);
    expect(l.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(l.code).not.toContain("VL-");
    expect(l.amountKobo).toBe(5_000_000);
    expect(l.message).toContain(`${SITE}/pay/${l.code}`);
    const hold = await q1<{ hold_expires_at: string }>("SELECT hold_expires_at FROM reservations WHERE id = ?", r);
    expect(l.expiresAt).toBe(hold.hold_expires_at);
    expect(await payLinkView(db, l.code)).toMatchObject({ state: "open", amountKobo: 5_000_000, needsEmail: false });
    await rejects(createPayLink(db, { id: desk!.id, role: "finance" }, r, SITE), /role can't do this/);
  });

  it("a new link replaces the old one; unknown codes show nothing", async () => {
    const r = await unpaid();
    const a = await createPayLink(db, desk, r, SITE);
    const b = await createPayLink(db, desk, r, SITE);
    expect(await payLinkView(db, a.code)).toEqual({ state: "closed", reason: "cancelled" });
    expect((await payLinkView(db, b.code)).state).toBe("open");
    expect(await payLinkView(db, "x".repeat(43))).toEqual({ state: "closed", reason: "unknown" });
    expect(await payLinkView(db, "VL-ABC123")).toEqual({ state: "closed", reason: "unknown" });
  });

  it("stops working once paid (it sends the guest to their booking) or when the hold ends", async () => {
    const r = await unpaid();
    const l = await createPayLink(db, desk, r, SITE);
    const paid = await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    expect((await payLinkView(db, l.code)).state).toBe("paid");
    expect(await q1("SELECT paid_payment_id FROM pay_links WHERE code = ?", l.code)).toEqual({ paid_payment_id: paid.paymentId });
    const r2 = await unpaid();
    const l2 = await createPayLink(db, desk, r2, SITE);
    await exec("UPDATE reservations SET hold_expires_at = ? WHERE id = ?", iso(-60_000), r2);
    expect(await payLinkView(db, l2.code)).toEqual({ state: "closed", reason: "expired" });
    await rejects(tokenForPayment(db, l2.code, null), /link has ended/);
  });

  it("a part-paid booking can be paid online through a link", async () => {
    const r = await unpaid();
    await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 2_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    expect(await status(r)).toBe("confirmed");
    const l = await createPayLink(db, desk, r, SITE);
    expect(l.amountKobo).toBe(3_000_000);
    const token = await tokenForPayment(db, l.code, null);
    const attempt = await beginPaystackPayment(db, token);
    expect(attempt.amountKobo).toBe(3_000_000);
  });

  it("a guest without an email gives one before paying (Paystack needs it)", async () => {
    const r = await unpaid({ email: null });
    const l = await createPayLink(db, desk, r, SITE);
    expect(await payLinkView(db, l.code)).toMatchObject({ needsEmail: true });
    await rejects(tokenForPayment(db, l.code, "not-an-email"), /Enter your email/);
    await tokenForPayment(db, l.code, "Ngozi@Example.com");
    expect((await q1<{ email: string }>("SELECT g.email FROM guests g JOIN reservations r ON r.guest_id = g.id WHERE r.id = ?", r)).email).toBe("ngozi@example.com");
  });
});

describe("never release a room with a payment in flight", () => {
  it("a hold that ends during an online payment gets 30 minutes more, once, and the desk is told", async () => {
    const r = await unpaid({ holdMinutes: 60 });
    const token = (await q1<{ public_token: string }>("SELECT public_token FROM reservations WHERE id = ?", r)).public_token;
    await beginPaystackPayment(db, token);
    await exec("UPDATE reservations SET hold_expires_at = ? WHERE id = ?", iso(-1000), r);
    await expireUnpaidReservations(db);
    const after = await q1<{ status: string; hold_expires_at: string; attention_reason: string }>("SELECT status, hold_expires_at, attention_reason FROM reservations WHERE id = ?", r);
    expect(after.status).toBe("pending_payment");
    expect(Date.parse(after.hold_expires_at) - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(after.attention_reason).toMatch(/Payment in progress/);
    // Only once: when the extra 30 minutes run out it's released as usual.
    await exec("UPDATE reservations SET hold_expires_at = ? WHERE id = ?", iso(-1000), r);
    await expireUnpaidReservations(db);
    expect(await status(r)).toBe("expired");
  });
});
