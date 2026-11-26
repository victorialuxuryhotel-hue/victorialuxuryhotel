// Interface brief I3: "13 of 18 arrived". The list and the done count use the same conditions, so a
// guest moves from one to the other and the total stays put.
import { describe, expect, it } from "vitest";
import { tonight } from "@/lib/hotel-date";
import { ARRIVED_SQL, DUE_IN_SQL, DUE_OUT_SQL, LEFT_SQL, movementProgress } from "@/server/domain/movements";
import { checkInReservation, checkOutReservation } from "@/server/domain/reservations";
import { day, db, desk, exec, insertReservation, makeCategory } from "./helpers";

/** Counts for one room type only, so other tests' bookings for today don't move the numbers. */
async function counts(categoryId: string) {
  const n = async (where: string) =>
    (await db.prepare(`SELECT count(*) AS n FROM reservations r WHERE ${where} AND r.category_id = ?3`).bind(tonight(), day(0), categoryId).first<{ n: number }>())!.n;
  const [dueIn, arrived, dueOut, left] = await Promise.all([n(DUE_IN_SQL), n(ARRIVED_SQL), n(DUE_OUT_SQL), n(LEFT_SQL)]);
  return { dueIn, arrived, arrivingTotal: dueIn + arrived, dueOut, left, leavingTotal: dueOut + left };
}

describe("arriving and leaving progress", () => {
  it("checking in and out moves a guest from the list to done; totals don't change", async () => {
    const c = await makeCategory(4);
    const coming = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), roomId: c.roomIds[0], status: "confirmed" });
    await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" }); // still to come
    const going = await insertReservation({ categoryId: c.id, checkIn: day(-2), checkOut: day(0), roomId: c.roomIds[2], status: "confirmed" });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", going);
    const cancelled = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1) });
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", cancelled);

    expect(await counts(c.id)).toEqual({ dueIn: 2, arrived: 0, arrivingTotal: 2, dueOut: 1, left: 0, leavingTotal: 1 });

    await checkInReservation(db, desk, coming);
    expect(await counts(c.id)).toMatchObject({ dueIn: 1, arrived: 1, arrivingTotal: 2 });

    await checkOutReservation(db, desk, going);
    expect(await counts(c.id)).toMatchObject({ dueOut: 0, left: 1, leavingTotal: 1 });
  });

  it("movementProgress counts the same rows (all types)", async () => {
    const c = await makeCategory(1);
    const before = await movementProgress(db, tonight(), day(0));
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), roomId: c.roomIds[0], status: "confirmed" });
    await checkInReservation(db, desk, r);
    expect((await movementProgress(db, tonight(), day(0))).arrived).toBeGreaterThanOrEqual(before.arrived + 1);
  });
});
