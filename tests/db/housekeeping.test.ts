import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { cleaningList, markTidied } from "@/server/domain/housekeeping";
import { assignRoom, checkInReservation, updateRoomStatus } from "@/server/domain/reservations";
import { z } from "zod";
import { day, db, desk, exec, gm, insertReservation, lapseHold, makeCategory, owner, q, q1, rejects } from "./helpers";

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

  it("double taps and two staff at once leave one entry", async () => {
    const c = await makeCategory(2);
    const [dirty, staying] = c.roomIds as [string, string];
    await exec("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?", dirty);
    const s = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(2), status: "confirmed" });
    await assignRoom(db, desk, s, staying);
    await checkInReservation(db, desk, s);

    await Promise.all([1, 2, 3].map(() => updateRoomStatus(db, desk, { roomId: dirty, readiness: "ready" })));
    await updateRoomStatus(db, gm, { roomId: dirty, readiness: "ready" });
    await Promise.all([1, 2, 3].map(() => markTidied(db, desk, staying)));
    await markTidied(db, gm, staying);

    const log = await q<{ entity_id: string; action: string }>(
      "SELECT entity_id, action FROM activity_log WHERE entity_id IN (?, ?) AND action IN ('room.status_updated', 'room.tidied')", dirty, staying);
    expect(log.filter((l) => l.entity_id === dirty)).toHaveLength(1);
    expect(log.filter((l) => l.entity_id === staying)).toHaveLength(1);
  });

  it("a maintenance note edit is kept and doesn't count as cleaned", async () => {
    const c = await makeCategory(1);
    const room = c.roomIds[0]!;
    await updateRoomStatus(db, desk, { roomId: room, serviceStatus: "maintenance", note: "Leaking tap" });
    await updateRoomStatus(db, desk, { roomId: room, serviceStatus: "maintenance", note: "Leaking tap, plumber Monday" });
    expect((await q1<{ maintenance_note: string }>("SELECT maintenance_note FROM rooms WHERE id = ?", room)).maintenance_note).toBe("Leaking tap, plumber Monday");
    const number = (await q1<{ room_number: string }>("SELECT room_number FROM rooms WHERE id = ?", room)).room_number;
    expect((await cleaningList(db, desk)).doneToday.some((d) => d.room === number)).toBe(false);
  });

  it("counts arrivals with no room, ignoring lapsed holds", async () => {
    const c = await makeCategory(3);
    const before = (await cleaningList(db, desk)).arrivalsWithoutRoom;
    await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    const hold = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1) });
    expect((await cleaningList(db, desk)).arrivalsWithoutRoom).toBe(before + 2);
    await lapseHold(hold);
    expect((await cleaningList(db, desk)).arrivalsWithoutRoom).toBe(before + 1);

    const lapsedRoom = c.roomIds[2]!;
    await exec("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?", lapsedRoom);
    const h2 = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), roomId: lapsedRoom });
    await lapseHold(h2);
    expect((await cleaningList(db, desk)).toClean.find((r) => r.id === lapsedRoom)?.arrivingToday).toBe(false);
  });

  it("rejects unknown rooms and read-only viewers", async () => {
    await rejects(markTidied(db, desk, crypto.randomUUID()), /Room not found/);
    const c = await makeCategory(1);
    await rejects(markTidied(db, { ...desk!, readOnly: true }, c.roomIds[0]!), /read-only/);
  });

  it("starter and seed SQL generate standard ids", async () => {
    const expr = "lower(printf('%s-%s-4%s-%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2), hex(randomblob(6))))";
    const fs = await import("node:fs");
    for (const f of ["db/starter.sql", "db/seed.sql"]) expect(fs.readFileSync(f, "utf8")).toContain(expr);
    const ids = await q<{ id: string }>(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 500) SELECT ${expr} AS id FROM n`);
    expect(ids.every((r) => z.uuid().safeParse(r.id).success)).toBe(true);
  });
});
