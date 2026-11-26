import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordOfflinePayment } from "@/server/domain/payments";
import { createWebsiteReservation } from "@/server/domain/reservations";
import { cancellationFee, checkGuestCode, guestBookings, guestCancel, guestChangeDates, issueGuestCode } from "@/server/domain/guest-account";
import { day, db, desk, exec, makeCategory, q1, rejects, status } from "./helpers";

const mail = () => `g-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function book(email: string, inDays: number) {
  const c = await makeCategory(2, { rateKobo: 5_500_000 });
  return createWebsiteReservation(db, { categorySlug: c.slug, checkIn: day(inDays), checkOut: day(inDays + 2), guests: 1, fullName: "Guest Self", email, phone: "+2348000000004" });
}

describe("guest accounts", () => {
  // "Tomorrow" must always fall inside the late-fee window. With the hotel's 24
  // hours it only does after check-in time today; with 48 it does all day.
  let freeHours: number;
  beforeAll(async () => {
    freeHours = (await q1<{ free_cancel_hours: number }>("SELECT free_cancel_hours FROM hotel_settings WHERE id = 1")).free_cancel_hours;
    await exec("UPDATE hotel_settings SET free_cancel_hours = 48 WHERE id = 1");
  });
  afterAll(async () => {
    await exec("UPDATE hotel_settings SET free_cancel_hours = ? WHERE id = 1", freeHours);
  });

  it("issues a single-use code only to emails with bookings, and locks after five wrong tries", async () => {
    expect(await issueGuestCode(db, mail())).toBeNull();
    const e = mail();
    await book(e, 30);
    const code = (await issueGuestCode(db, e.toUpperCase()))!;
    expect(code).toMatch(/^\d{6}$/);
    expect(await checkGuestCode(db, e, "000000" === code ? "111111" : "000000")).toBe(false);
    expect(await checkGuestCode(db, e, code)).toBe(true);
    expect(await checkGuestCode(db, e, code)).toBe(false);
    const next = (await issueGuestCode(db, e))!;
    for (let i = 0; i < 5; i++) await checkGuestCode(db, e, next === "999999" ? "888888" : "999999");
    expect(await checkGuestCode(db, e, next)).toBe(false);
  });

  it("charges the late fee inside the window only", () => {
    const rule = { checkInTime: "14:00", freeHours: 48, feePct: 50 };
    const at = Date.parse("2026-12-01T13:00:00Z"); // 2pm in Lagos
    expect(cancellationFee(11_000_000, "2026-12-04", rule, at)).toBe(0);
    expect(cancellationFee(11_000_000, "2026-12-02", rule, at)).toBe(5_500_000);
  });

  it("lists only the guest's bookings; cancelling a paid one keeps the fee and flags the refund", async () => {
    const e = mail();
    const far = await book(e, 30);
    const near = await book(e, 1);
    await book(mail(), 30);
    expect((await guestBookings(db, e)).map((b) => b.reference).sort()).toEqual([far.reference, near.reference].sort());

    await recordOfflinePayment(db, desk, { reservationId: near.id, amountKobo: 11_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    const r = await guestCancel(db, e, near.id);
    expect(r).toEqual({ feeKobo: 5_500_000, refundKobo: 5_500_000 });
    expect(await status(near.id)).toBe("cancelled");
    expect((await q1<{ attention_reason: string }>("SELECT attention_reason FROM reservations WHERE id = ?", near.id)).attention_reason).toMatch(/Refund ₦55,000/);

    await rejects(guestCancel(db, mail(), far.id), /not found/i);
    await guestChangeDates(db, e, far.id, day(31), day(34));
    expect(await q1("SELECT check_in, check_out, total_amount_kobo FROM reservations WHERE id = ?", far.id)).toEqual({ check_in: day(31), check_out: day(34), total_amount_kobo: 16_500_000 });
  });

  it("parallel wrong guesses still get only five tries", async () => {
    const e = mail();
    await book(e, 40);
    const code = (await issueGuestCode(db, e))!;
    const wrong = code === "123456" ? "654321" : "123456";
    await Promise.all(Array.from({ length: 12 }, () => checkGuestCode(db, e, wrong)));
    expect(await checkGuestCode(db, e, code)).toBe(false);
  });

  it("a paid booking can't dodge the late fee by moving its dates first", async () => {
    const e = mail();
    const near = await book(e, 1);
    await recordOfflinePayment(db, desk, { reservationId: near.id, amountKobo: 11_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    expect((await guestBookings(db, e)).find((b) => b.id === near.id)?.canChange).toBe(false);
    await rejects(guestChangeDates(db, e, near.id, day(100), day(101)), /made by the hotel/);
    const { feeKobo } = await guestCancel(db, e, near.id);
    expect(feeKobo).toBeGreaterThan(0);
  });

  it("the same payment form submitted twice records one payment", async () => {
    const e = mail();
    const r = await book(e, 50);
    const paymentId = crypto.randomUUID();
    const input = { reservationId: r.id, paymentId, amountKobo: 11_000_000, method: "cash" as const, paidOn: day(0), confirmReceived: true };
    const [a, b] = await Promise.all([recordOfflinePayment(db, desk, input), recordOfflinePayment(db, desk, input)]);
    expect(a.receiptNumber).toBe(b.receiptNumber);
    expect((await q1<{ n: number }>("SELECT count(*) AS n FROM payments WHERE reservation_id = ?", r.id)).n).toBe(1);
    await recordOfflinePayment(db, desk, input);
    expect((await q1<{ n: number }>("SELECT count(*) AS n FROM payments WHERE reservation_id = ?", r.id)).n).toBe(1);
  });
});
