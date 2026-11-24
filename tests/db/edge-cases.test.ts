import { describe, expect, it } from "vitest";
import { occupancyReport } from "@/server/domain/reports";
import { recordOfflinePayment } from "@/server/domain/payments";
import { assignRoom, changeReservationDates, checkInReservation, checkOutReservation, markNoShow, undoAction, updateRoomStatus } from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, makeCategory, q1, rejects } from "./helpers";

async function checkedIn(rooms = 1) {
  const c = await makeCategory(rooms);
  const id = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
  await assignRoom(db, desk, id, c.roomIds[0]!);
  const { undoId } = await checkInReservation(db, desk, id);
  return { c, id, undoId: undoId! };
}

describe("edge cases", () => {
  it("won't put a room with an upcoming booking into maintenance", async () => {
    const c = await makeCategory(1);
    const room = c.roomIds[0]!;
    const id = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(7), roomId: room, status: "confirmed" });
    await rejects(updateRoomStatus(db, gm, { roomId: room, serviceStatus: "maintenance", note: "Paint" }), /Move that booking/);
    await exec("UPDATE reservations SET status = 'cancelled', cancellation_reason = 'test' WHERE id = ?", id);
    await updateRoomStatus(db, gm, { roomId: room, serviceStatus: "maintenance", note: "Paint" });
  });

  it("won't move a staying guest into a room that isn't clean", async () => {
    const { c, id } = await checkedIn(2);
    const other = c.roomIds[1]!;
    await exec("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?", other);
    await rejects(assignRoom(db, desk, id, other), /isn't clean/);
    await updateRoomStatus(db, desk, { roomId: other, readiness: "ready" });
    await assignRoom(db, desk, id, other);
  });

  it("an early check-out stops counting toward occupancy, and occupancy never passes 100%", async () => {
    const c = await makeCategory(1);
    const id = await insertReservation({ categoryId: c.id, checkIn: day(-1), checkOut: day(3), roomId: c.roomIds[0], status: "confirmed" });
    await exec("UPDATE reservations SET status = 'checked_in', checked_in_at = ? WHERE id = ?", new Date().toISOString(), id);
    const before = await occupancyReport(db, gm, "14d");
    await exec("UPDATE reservations SET status = 'checked_out', checked_out_at = ? WHERE id = ?", new Date().toISOString(), id);
    const after = await occupancyReport(db, gm, "14d");
    const on = (r: typeof before, d: string) => r.nights.find((n) => n.day === d)?.occupied ?? 0;
    expect(on(after, day(0))).toBe(on(before, day(0)) - 1);
    expect(on(after, day(-1))).toBe(on(before, day(-1)));
    expect(after.nights.every((n) => n.pct <= 100)).toBe(true);
    expect((await q1<{ n: number }>("SELECT count(*) AS n FROM rooms WHERE is_active = 1")).n).toBe(after.roomsInService);
  });

  it("a no-show forfeits the booking: everything paid is kept, nothing is flagged for refund; undo clears it", async () => {
    const c = await makeCategory(1, { rateKobo: 5_500_000 });
    const id = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed", rateKobo: 5_500_000 });
    const { undoId } = await markNoShow(db, desk, id);
    expect(await q1("SELECT status, cancellation_fee_kobo AS fee, attention_reason AS note FROM reservations WHERE id = ?", id)).toEqual({ status: "no_show", fee: 11_000_000, note: null });
    await undoAction(db, desk, id, undoId!);
    expect(await q1("SELECT status, cancellation_fee_kobo AS fee FROM reservations WHERE id = ?", id)).toEqual({ status: "confirmed", fee: null });
  });

  it("moving to a dearer room type charges the difference for the nights left; undo removes it; a manager can waive it", async () => {
    const std = await makeCategory(2, { rateKobo: 5_500_000 });
    const dlx = await makeCategory(2, { rateKobo: 7_500_000 });
    const id = await insertReservation({ categoryId: std.id, checkIn: day(0), checkOut: day(3), roomId: std.roomIds[0], status: "confirmed", rateKobo: 5_500_000 });
    const { undoId, chargeKobo } = await assignRoom(db, desk, id, dlx.roomIds[0]!);
    expect(chargeKobo).toBe(3 * 2_000_000);
    await rejects(checkInReservation(db, desk, id), /₦60,000 still to pay/);
    await undoAction(db, desk, id, undoId!);
    expect((await q1<{ c: number }>("SELECT room_change_kobo AS c FROM reservations WHERE id = ?", id)).c).toBe(0);
    await rejects(assignRoom(db, desk, id, dlx.roomIds[1]!, { waiveCharge: true }), /Only the general manager or owner/);
    expect((await assignRoom(db, gm, id, dlx.roomIds[1]!, { waiveCharge: true })).chargeKobo).toBe(0);
    expect((await assignRoom(db, desk, id, std.roomIds[1]!)).chargeKobo).toBe(0);
  });

  it("extending a stay leaves the extra to pay, and the guest can't check out until it's paid", async () => {
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const id = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    await assignRoom(db, desk, id, c.roomIds[0]!);
    await checkInReservation(db, desk, id);
    await changeReservationDates(db, desk, id, day(0), day(2));
    await rejects(checkOutReservation(db, desk, id), /₦50,000 still to pay/);
    await recordOfflinePayment(db, desk, { reservationId: id, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    expect((await checkOutReservation(db, desk, id)).balance).toBe(0);
  });
});
