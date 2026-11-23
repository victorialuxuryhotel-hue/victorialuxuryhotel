import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { cleaningList, markTidied } from "@/server/domain/housekeeping";
import { assignRoom, checkInReservation, updateRoomStatus } from "@/server/domain/reservations";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, q1, rejects } from "./helpers";

const bar: Actor = { id: owner!.id, role: "restaurant_bar" };

describe("housekeeping", () => {
  it("lists rooms to clean (arrivals first), daily tidies, and what was done today", async () => {
    const c = await makeCategory(3);
    const [plain, arrival, staying] = c.roomIds as [string, string, string];
    await exec("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id IN (?, ?)", plain, arrival);
    await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed", roomId: arrival });
    const s = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    await assignRoom(db, desk, s, staying);
    await checkInReservation(db, desk, s);

    const before = await cleaningList(db, desk);
    const mine = before.toClean.filter((r) => [plain, arrival].includes(r.id));
    expect(mine.map((r) => [r.id, r.arrivingToday])).toEqual([[arrival, true], [plain, false]]);
    expect(before.toClean.findIndex((r) => r.id === arrival)).toBeLessThan(before.toClean.findIndex((r) => !r.arrivingToday));
    expect(before.stayOvers.find((r) => r.id === staying)?.tidiedAt).toBeNull();

    await updateRoomStatus(db, desk, { roomId: arrival, readiness: "ready" });
    await markTidied(db, desk, staying);
    const after = await cleaningList(db, gm);
    expect(after.toClean.some((r) => r.id === arrival)).toBe(false);
    expect(after.stayOvers.find((r) => r.id === staying)?.tidiedAt).toBeTruthy();
    const number = async (id: string) => (await q1<{ room_number: string }>("SELECT room_number FROM rooms WHERE id = ?", id)).room_number;
    const rooms = [await number(arrival), await number(staying)];
    expect(after.doneToday.filter((d) => rooms.includes(d.room)).map((d) => d.what).sort()).toEqual(["cleaned", "tidied"]);
  });

  it("tidy needs a guest staying; restaurant staff can't use it", async () => {
    const c = await makeCategory(1);
    await rejects(markTidied(db, desk, c.roomIds[0]!), /No guest is staying/);
    await rejects(cleaningList(db, bar), /role does not allow/);
  });
});
