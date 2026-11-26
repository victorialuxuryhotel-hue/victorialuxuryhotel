// Interface brief I6: the room calendar. Same free counts as everywhere else; bookings in the window
// with their effective end; a room asked for from the calendar is given on payment if it's free.
import { describe, expect, it } from "vitest";
import { recordOfflinePayment } from "@/server/domain/payments";
import { calendarData } from "@/server/domain/calendar";
import { searchAvailability } from "@/server/domain/inventory";
import { createStaffReservation } from "@/server/domain/reservations";
import { day, db, desk, exec, insertReservation, makeCategory, makeRoom, q1, rejects } from "./helpers";

const fin = { id: desk!.id, role: "finance" as const };

describe("room calendar", () => {
  it("each night's free count matches the website's search for that night", async () => {
    const c = await makeCategory(2);
    await makeRoom(c.id, { serviceStatus: "maintenance" });
    await insertReservation({ categoryId: c.id, checkIn: day(150), checkOut: day(152), status: "confirmed" });
    const cal = await calendarData(db, desk, day(149), 14);
    for (const n of [149, 150, 151, 152]) {
      const site = (await searchAvailability(db, day(n), day(n + 1), 1)).find((r) => r.category_id === c.id)!;
      expect(cal.free.get(c.id)!.get(day(n))! > 0).toBe(site.is_available);
    }
    expect([149, 150, 151, 152].map((n) => cal.free.get(c.id)!.get(day(n)))).toEqual([2, 1, 1, 2]);
  });

  it("lists the bookings in the window, an overstaying guest to their effective end, and out-of-order rooms", async () => {
    const c = await makeCategory(2);
    const broken = await makeRoom(c.id, { serviceStatus: "maintenance" });
    const over = await insertReservation({ categoryId: c.id, checkIn: day(-5), checkOut: day(-2), roomId: c.roomIds[0], status: "confirmed" });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", over);
    const later = await insertReservation({ categoryId: c.id, checkIn: day(3), checkOut: day(5) });
    const outside = await insertReservation({ categoryId: c.id, checkIn: day(20), checkOut: day(21), status: "confirmed" });
    const cal = await calendarData(db, desk, day(0), 14);
    const mine = cal.stays.filter((s) => [over, later, outside].includes(s.id));
    expect(mine.map((s) => [s.id, s.status, s.end])).toEqual([
      [over, "checked_in", day(1)],
      [later, "pending_payment", day(5)],
    ]);
    expect(cal.rooms.find((r) => r.id === broken)).toMatchObject({ outOfOrder: true });
  });

  it("is for front desk and managers, not finance", async () => {
    await rejects(calendarData(db, fin, day(0), 14), /role can't do this/, "FORBIDDEN");
  });
});

describe("a room asked for from the calendar", () => {
  it("is given on payment when it's free", async () => {
    const c = await makeCategory(3);
    const r = await createStaffReservation(db, desk, { categoryId: c.id, checkIn: day(160), checkOut: day(161), guests: 1, source: "phone", fullName: "Asked Room", phone: "+2348000000041", preferredRoomId: c.roomIds[2] });
    const { total } = await q1<{ total: number }>("SELECT total_amount_kobo AS total FROM reservations WHERE id = ?", r.id);
    await recordOfflinePayment(db, desk, { reservationId: r.id, amountKobo: total, method: "cash", paidOn: day(0), confirmReceived: true });
    expect((await q1<{ room_id: string }>("SELECT room_id FROM reservations WHERE id = ?", r.id)).room_id).toBe(c.roomIds[2]);
  });

  it("falls back to another room when it was taken in the meantime", async () => {
    const c = await makeCategory(2);
    await insertReservation({ categoryId: c.id, checkIn: day(170), checkOut: day(171), roomId: c.roomIds[1], status: "confirmed" });
    const r = await createStaffReservation(db, desk, { categoryId: c.id, checkIn: day(170), checkOut: day(171), guests: 1, source: "phone", fullName: "Asked Taken", phone: "+2348000000042", preferredRoomId: c.roomIds[1] });
    const { total } = await q1<{ total: number }>("SELECT total_amount_kobo AS total FROM reservations WHERE id = ?", r.id);
    await recordOfflinePayment(db, desk, { reservationId: r.id, amountKobo: total, method: "cash", paidOn: day(0), confirmReceived: true });
    expect((await q1<{ room_id: string }>("SELECT room_id FROM reservations WHERE id = ?", r.id)).room_id).toBe(c.roomIds[0]);
  });

  it("must be a room of the booking's type", async () => {
    const a = await makeCategory(1);
    const b = await makeCategory(1);
    await rejects(
      createStaffReservation(db, desk, { categoryId: a.id, checkIn: day(180), checkOut: day(181), guests: 1, source: "phone", fullName: "Wrong Type", phone: "+2348000000043", preferredRoomId: b.roomIds[0] }),
      /isn't one of the chosen room type/,
    );
  });
});
