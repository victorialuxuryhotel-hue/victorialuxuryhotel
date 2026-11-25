// Fix 3 / rules 2.1: a change that costs more on a paid booking waits for its payment, and the
// payment applies it in the same step. Only the General Manager or Owner can apply one first.

import { describe, expect, it } from "vitest";
import { applyChangeWithoutPayment, cancelChange, pendingChange } from "@/server/domain/changes";
import { recordOfflinePayment } from "@/server/domain/payments";
import { assignRoom, changeReservationDates, checkOutReservation, netPaid, loadReservation, dueOf } from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, makeCategory, q1, rejects } from "./helpers";

/** A paid guest in a standard room, checked in, staying until day(2); plus a better room type. */
async function inHouse() {
  const std = await makeCategory(2, { rateKobo: 5_000_000 });
  const suite = await makeCategory(1, { rateKobo: 8_000_000 });
  const id = await insertReservation({ categoryId: std.id, checkIn: day(0), checkOut: day(2), status: "confirmed", rateKobo: 5_000_000 });
  await exec("UPDATE reservations SET room_id = ? WHERE id = ?", std.roomIds[0], id);
  await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", id);
  return { id, std, suite };
}
const owed = async (id: string) => dueOf(await loadReservation(db, id)) - (await netPaid(db, id)) + ((await pendingChange(db, id))?.amount_kobo ?? 0);
const pay = (reservationId: string, amountKobo: number) =>
  recordOfflinePayment(db, desk, { reservationId, amountKobo, method: "cash", paidOn: day(0), confirmReceived: true });
const row = (id: string) => q1<{ room_id: string; check_out: string; room_change_kobo: number }>("SELECT room_id, check_out, room_change_kobo FROM reservations WHERE id = ?", id);

describe("changes wait for payment", () => {
  it("an upgrade for a paid guest waits; taking the payment moves them", async () => {
    const { id, std, suite } = await inHouse();
    const r = await assignRoom(db, desk, id, suite.roomIds[0]!);
    expect(r).toMatchObject({ chargeKobo: 6_000_000, undoId: null });
    expect(r.pendingChangeId).toBeTruthy();
    expect(await row(id)).toMatchObject({ room_id: std.roomIds[0], room_change_kobo: 0 });
    expect(await owed(id)).toBe(6_000_000);

    await rejects(pay(id, 1_000_000), /Take the full ₦60,000 owed/);
    await pay(id, 6_000_000);
    expect(await row(id)).toMatchObject({ room_id: suite.roomIds[0], room_change_kobo: 6_000_000 });
    expect(await owed(id)).toBe(0);
    const change = await q1<{ status: string; payment_id: string | null }>("SELECT status, payment_id FROM reservation_changes WHERE id = ?", r.pendingChangeId);
    expect(change.status).toBe("applied");
    expect(change.payment_id).toBeTruthy();
    expect((await q1<{ readiness: string }>("SELECT readiness FROM rooms WHERE id = ?", std.roomIds[0])).readiness).toBe("needs_cleaning");
  });

  it("extra nights for a guest in house wait; taking the payment extends the stay", async () => {
    const { id } = await inHouse();
    const r = await changeReservationDates(db, desk, id, day(0), day(3));
    expect(r.chargeKobo).toBe(5_000_000);
    expect((await row(id)).check_out).toBe(day(2));
    await pay(id, 5_000_000);
    expect((await row(id)).check_out).toBe(day(3));
    expect(await owed(id)).toBe(0);
  });

  it("one waiting change at a time; cancelling it leaves the booking as it was", async () => {
    const { id, suite } = await inHouse();
    const first = await changeReservationDates(db, desk, id, day(0), day(3));
    await rejects(assignRoom(db, desk, id, suite.roomIds[0]!), /already has a change waiting for payment: Stay extended/, "CONFLICT");
    await cancelChange(db, desk, first.pendingChangeId!);
    expect(await owed(id)).toBe(0);
    await rejects(pay(id, 5_000_000), /already paid in full/);
    await rejects(cancelChange(db, desk, first.pendingChangeId!), /already been paid for or cancelled/);
  });

  it("only the General Manager or Owner can apply one before payment, with a reason; check-out then waits for the money", async () => {
    const { id } = await inHouse();
    const r = await changeReservationDates(db, desk, id, day(0), day(3));
    await rejects(applyChangeWithoutPayment(db, desk, r.pendingChangeId!, "Regular guest"), /role can't do this/, "FORBIDDEN");
    await rejects(applyChangeWithoutPayment(db, gm, r.pendingChangeId!, "ok"), /Give a reason/);
    await applyChangeWithoutPayment(db, gm, r.pendingChangeId!, "Regular guest, pays at check-out");
    expect((await row(id)).check_out).toBe(day(3));
    expect(await owed(id)).toBe(5_000_000);
    await rejects(checkOutReservation(db, desk, id), /owed\. Take the payment before check-out/);
    await pay(id, 5_000_000);
    await checkOutReservation(db, desk, id);
  });

  it("if the room is given away before the payment, the payment is refused and nothing is recorded", async () => {
    const { id, suite } = await inHouse();
    const r = await assignRoom(db, desk, id, suite.roomIds[0]!);
    const other = await insertReservation({ categoryId: suite.id, checkIn: day(0), checkOut: day(1), status: "confirmed", rateKobo: 8_000_000 });
    await exec("UPDATE reservations SET room_id = ? WHERE id = ?", suite.roomIds[0], other);
    const paidBefore = await netPaid(db, id);
    await rejects(pay(id, r.chargeKobo), /has been given to another guest since|filled up since/);
    expect(await netPaid(db, id)).toBe(paidBefore);
    expect((await pendingChange(db, id))?.id).toBe(r.pendingChangeId);
  });

  it("changes that cost nothing more still happen at once", async () => {
    const { id, std } = await inHouse();
    await assignRoom(db, desk, id, std.roomIds[1]!); // same room type
    expect((await row(id)).room_id).toBe(std.roomIds[1]);
    await changeReservationDates(db, desk, id, day(0), day(1)); // shorter
    expect((await row(id)).check_out).toBe(day(1));
    expect(await pendingChange(db, id)).toBeNull();
    const unpaid = await insertReservation({ categoryId: std.id, checkIn: day(5), checkOut: day(6) });
    await changeReservationDates(db, desk, unpaid, day(5), day(7)); // not paid yet: the price just changes
    expect(await pendingChange(db, unpaid)).toBeNull();
  });

  it("a free upgrade by the General Manager happens at once", async () => {
    const { id, suite } = await inHouse();
    const r = await assignRoom(db, gm, id, suite.roomIds[0]!, { waiveCharge: true });
    expect(r.pendingChangeId).toBeUndefined();
    expect((await row(id)).room_id).toBe(suite.roomIds[0]);
  });

  it("the database keeps the record: never deleted, decided once, and only managers apply before payment", async () => {
    const { id } = await inHouse();
    const r = await changeReservationDates(db, desk, id, day(0), day(3));
    await rejects(exec("UPDATE reservation_changes SET status = 'applied', decided_by = ?, decided_at = 'x', note = 'Because I can' WHERE id = ?", desk!.id, r.pendingChangeId), /change_needs_approval/);
    await rejects(exec("UPDATE reservation_changes SET amount_kobo = 1 WHERE id = ?", r.pendingChangeId), /change_immutable/);
    await rejects(exec("DELETE FROM reservation_changes WHERE id = ?", r.pendingChangeId), /change_immutable/);
    await cancelChange(db, desk, r.pendingChangeId!);
    await rejects(exec("UPDATE reservation_changes SET status = 'applied', decided_by = ?, note = 'Manager says so' WHERE id = ?", gm!.id, r.pendingChangeId), /change_immutable/);
  });
});
