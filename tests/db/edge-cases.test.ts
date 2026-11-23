import { describe, expect, it } from "vitest";
import { addMenuItem, recordSale, settleRoomCharges } from "@/server/domain/pos";
import { occupancyReport } from "@/server/domain/reports";
import { recordOfflinePayment } from "@/server/domain/payments";
import { assignRoom, checkInReservation, markNoShow, undoAction, updateRoomStatus } from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, makeCategory, q, q1, rejects } from "./helpers";

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

  it("can't undo a check-in once the guest has room charges", async () => {
    const { id, undoId } = await checkedIn();
    const item = await addMenuItem(db, gm, { name: `Malt ${crypto.randomUUID().slice(0, 4)}`, outlet: "bar", priceKobo: 100_000 });
    await recordSale(db, gm, { outlet: "bar", items: [{ menuItemId: item, quantity: 1 }], reservationId: id });
    await rejects(undoAction(db, desk, id, undoId), /no longer be undone/);
  });

  it("settling room charges settles exactly what was totalled, even with a sale arriving at the same time", async () => {
    const { id } = await checkedIn();
    const item = await addMenuItem(db, gm, { name: `Zobo ${crypto.randomUUID().slice(0, 4)}`, outlet: "bar", priceKobo: 150_000 });
    const sell = () => recordSale(db, gm, { outlet: "bar", items: [{ menuItemId: item, quantity: 1 }], reservationId: id });
    await sell();
    const [settled] = await Promise.all([settleRoomCharges(db, desk, id, "cash"), sell()]);
    const rows = await q<{ status: string; total_kobo: number }>("SELECT status, total_kobo FROM sales WHERE reservation_id = ?", id);
    const settledKobo = rows.filter((r) => r.status === "settled").reduce((s, r) => s + r.total_kobo, 0);
    expect(settledKobo).toBe(settled);
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

  it("a no-show keeps the late-cancellation fee and flags the rest for refund; undo clears it", async () => {
    const c = await makeCategory(1, { rateKobo: 5_500_000 });
    const id = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed", rateKobo: 5_500_000 });
    await recordOfflinePayment(db, desk, { reservationId: id, amountKobo: 11_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    const { undoId } = await markNoShow(db, desk, id);
    const after = await q1<{ status: string; cancellation_fee_kobo: number; attention_reason: string | null }>(
      "SELECT status, cancellation_fee_kobo, attention_reason FROM reservations WHERE id = ?", id);
    expect(after.status).toBe("no_show");
    expect(after.cancellation_fee_kobo).toBe(5_500_000);
    expect(after.attention_reason).toMatch(/^No-show\. Refund ₦55,000 \(fee kept: ₦55,000\)\.$/);

    await undoAction(db, desk, id, undoId!);
    const undone = await q1<{ status: string; cancellation_fee_kobo: number | null; attention_reason: string | null }>(
      "SELECT status, cancellation_fee_kobo, attention_reason FROM reservations WHERE id = ?", id);
    expect(undone).toEqual({ status: "confirmed", cancellation_fee_kobo: null, attention_reason: null });
  });

  it("an unpaid no-show has no fee and nothing to refund", async () => {
    const c = await makeCategory(1);
    const id = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    await markNoShow(db, desk, id);
    expect(await q1("SELECT cancellation_fee_kobo AS fee, attention_reason AS note FROM reservations WHERE id = ?", id)).toEqual({ fee: 0, note: null });
  });
});
