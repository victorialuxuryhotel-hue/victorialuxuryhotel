import { createStaffReservation } from "@/server/domain/reservations";
import { describe, expect, it } from "vitest";
import { addExtra, addPromo, setExtraActive, setPromoActive } from "@/server/domain/admin";
import { createHallBooking, recordHallPayment, setHallStatus } from "@/server/domain/events";
import { day, db, desk, gm, makeCategory, q, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 6);
const logCount = async (id: string) => (await q("SELECT 1 FROM activity_log WHERE entity_id = ?", id)).length;

describe("repeated and concurrent actions", () => {
  it("a failed or repeated status change writes no extra log entry", async () => {
    const id = await createHallBooking(db, gm, {
      title: "Workshop", customerName: "Acme", phone: null, email: null, guests: 10, priceKobo: 0, notes: null,
      eventDate: day(300 + Math.floor(Math.random() * 300)), startTime: "09:00", endTime: "10:00",
    });
    await setHallStatus(db, gm, id, "cancelled");
    const after = await logCount(id);
    await rejects(setHallStatus(db, gm, id, "cancelled"), /already cancelled, or already at that stage/);
    await rejects(setHallStatus(db, gm, crypto.randomUUID(), "cancelled"), /already cancelled, or already at that stage/);
    expect(await logCount(id)).toBe(after);
  });

  it("switching an extra or promo to the state it's already in is a quiet no-op", async () => {
    const extra = await addExtra(db, gm, { name: `Towels ${rand()}`, priceKobo: 100_000, perNight: false });
    const promo = await addPromo(db, gm, { code: `P${rand().toUpperCase()}`, percentOff: 5, validUntil: null, maxUses: null });
    const [e0, p0] = [await logCount(extra), await logCount(promo)];
    await Promise.all([1, 2, 3].map(() => setExtraActive(db, gm, extra, false)));
    await Promise.all([1, 2, 3].map(() => setPromoActive(db, gm, promo, false)));
    await setExtraActive(db, gm, extra, false);
    expect(await logCount(extra)).toBe(e0 + 1);
    expect(await logCount(promo)).toBe(p0 + 1);
    await rejects(setExtraActive(db, gm, crypto.randomUUID(), true), /not found/);
  });

  it("two hall payments at once can't overpay", async () => {
    const id = await createHallBooking(db, gm, {
      title: "Wedding", customerName: "Ade", phone: null, email: null, guests: 100, priceKobo: 6_000_000, notes: null,
      eventDate: day(300 + Math.floor(Math.random() * 300)), startTime: "11:00", endTime: "12:00",
    });
    const pay = () => recordHallPayment(db, gm, { bookingId: id, amountKobo: 5_000_000, method: "cash", paidOn: day(0), reference: null });
    const results = await Promise.allSettled([pay(), pay(), pay()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ paid }] = (await q<{ paid: number }>("SELECT sum(amount_kobo) AS paid FROM hall_payments WHERE booking_id = ?", id)) as [{ paid: number }];
    expect(paid).toBe(5_000_000);
    expect((await q("SELECT 1 FROM activity_log WHERE entity_id = ? AND action = 'hall.payment'", id)).length).toBe(1);
  });

  it("the same new-booking form sent twice (double tap, retry) makes one booking", async () => {
    const c = await makeCategory(2);
    const requestId = crypto.randomUUID();
    const input = { categoryId: c.id, checkIn: day(90), checkOut: day(91), guests: 1, source: "walk_in" as const, fullName: "Twice Tapped", phone: "+2348000000031", requestId };
    const [a, b] = await Promise.all([createStaffReservation(db, desk, input), createStaffReservation(db, desk, input)]);
    const again = await createStaffReservation(db, desk, input);
    expect(new Set([a.id, b.id, again.id])).toEqual(new Set([requestId]));
    expect((await q("SELECT 1 FROM reservations WHERE id = ?", requestId)).length).toBe(1);
  });

  it("the same hall payment sent twice is recorded once", async () => {
    const id = await createHallBooking(db, gm, {
      title: "Retry", customerName: "Ade", phone: null, email: null, guests: 10, priceKobo: 9_000_000, notes: null,
      eventDate: day(300 + Math.floor(Math.random() * 300)), startTime: "14:00", endTime: "15:00",
    });
    const paymentId = crypto.randomUUID();
    const pay = () => recordHallPayment(db, gm, { bookingId: id, amountKobo: 1_000_000, method: "cash", paidOn: day(0), reference: null, paymentId });
    await Promise.allSettled([pay(), pay()]);
    await pay();
    expect((await q("SELECT 1 FROM hall_payments WHERE booking_id = ?", id)).length).toBe(1);
  });
});
