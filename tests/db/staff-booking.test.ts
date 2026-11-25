import { describe, expect, it } from "vitest";
import { availabilityForStay, findGuestsByPhone } from "@/server/domain/staff-booking";
import { recordOfflinePayment } from "@/server/domain/payments";
import { createStaffReservation } from "@/server/domain/reservations";
import { day, db, desk, exec, insertReservation, makeCategory, q1 } from "./helpers";

describe("new reservation helpers (6d)", () => {
  it("finds a returning guest by phone typed in another format, from 7 digits", async () => {
    const id = crypto.randomUUID();
    const n = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
    await exec("INSERT INTO guests (id, full_name, email, phone) VALUES (?, 'Phone Match', ?, ?)", id, `pm-${n}@example.com`, `+234 803 ${n.slice(0, 3)} ${n.slice(3)}`);
    const found = await findGuestsByPhone(db, desk, `0803${n}`);
    expect(found.map((g) => g.id)).toContain(id);
    expect(await findGuestsByPhone(db, desk, "0803")).toEqual([]);
  });

  it("shows free rooms per type for the dates, and a type full for tonight", async () => {
    const c = await makeCategory(1);
    const before = (await availabilityForStay(db, desk, day(70), day(71))).find((a) => a.categoryId === c.id);
    expect(before?.free).toBe(1);
    await createStaffReservation(db, desk, { categoryId: c.id, checkIn: day(70), checkOut: day(71), guests: 1, source: "walk_in", fullName: "Full Tonight", phone: "+2348000000011" });
    const after = (await availabilityForStay(db, desk, day(70), day(71))).find((a) => a.categoryId === c.id);
    expect(after?.free).toBe(0);
  });

  it("doesn't offer an overstaying guest's room, and the list agrees with the count", async () => {
    const c = await makeCategory(2);
    const stay = await insertReservation({ categoryId: c.id, checkIn: day(-4), checkOut: day(-2), roomId: c.roomIds[0], status: "confirmed" });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", stay);
    const tonight = (await availabilityForStay(db, desk, day(0), day(1))).find((a) => a.categoryId === c.id)!;
    expect(tonight.free).toBe(1);
    expect(tonight.rooms.map((r) => r.id)).toEqual([c.roomIds[1]]);
  });

  it("a new staff booking has no room until it's paid; payment assigns a ready one", async () => {
    const c = await makeCategory(2);
    const r = await createStaffReservation(db, desk, { categoryId: c.id, checkIn: day(80), checkOut: day(82), guests: 1, source: "walk_in", fullName: "Room Later", phone: "+2348000000012" });
    expect((await q1<{ room_id: string | null }>("SELECT room_id FROM reservations WHERE id = ?", r.id)).room_id).toBeNull();
    const { total } = await q1<{ total: number }>("SELECT total_amount_kobo AS total FROM reservations WHERE id = ?", r.id);
    await recordOfflinePayment(db, desk, { reservationId: r.id, amountKobo: total, method: "cash", paidOn: day(0), confirmReceived: true });
    expect(c.roomIds).toContain((await q1<{ room_id: string }>("SELECT room_id FROM reservations WHERE id = ?", r.id)).room_id);
  });
});
