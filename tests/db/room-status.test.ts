import { describe, expect, it } from "vitest";
import { z } from "zod";
import { updateRoomStatus } from "@/server/domain/reservations";
import { db, desk, exec, gm, makeCategory, q, q1 } from "./helpers";

describe("room status", () => {
  it("double taps and two staff at once leave one log entry", async () => {
    const c = await makeCategory(1);
    const room = c.roomIds[0]!;
    await exec("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?", room);
    await Promise.all([1, 2, 3].map(() => updateRoomStatus(db, desk, { roomId: room, readiness: "ready" })));
    await updateRoomStatus(db, gm, { roomId: room, readiness: "ready" });
    expect(await q("SELECT 1 FROM activity_log WHERE entity_id = ? AND action = 'room.status_updated'", room)).toHaveLength(1);
  });

  it("a maintenance note edit is kept and logged without a readiness change", async () => {
    const c = await makeCategory(1);
    const room = c.roomIds[0]!;
    await updateRoomStatus(db, desk, { roomId: room, serviceStatus: "maintenance", note: "Leaking tap" });
    await updateRoomStatus(db, desk, { roomId: room, serviceStatus: "maintenance", note: "Leaking tap, plumber Monday" });
    expect((await q1<{ maintenance_note: string }>("SELECT maintenance_note FROM rooms WHERE id = ?", room)).maintenance_note).toBe("Leaking tap, plumber Monday");
    const log = await q<{ readiness: string | null }>(
      "SELECT json_extract(metadata, '$.readiness') AS readiness FROM activity_log WHERE entity_id = ? AND action = 'room.status_updated'", room);
    expect(log).toHaveLength(2);
    expect(log.every((l) => l.readiness === null)).toBe(true);
  });

  it("starter and seed SQL generate standard ids", async () => {
    const expr = "lower(printf('%s-%s-4%s-%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2), hex(randomblob(6))))";
    const fs = await import("node:fs");
    for (const f of ["db/starter.sql", "db/seed.sql"]) expect(fs.readFileSync(f, "utf8")).toContain(expr);
    const ids = await q<{ id: string }>(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 500) SELECT ${expr} AS id FROM n`);
    expect(ids.every((r) => z.uuid().safeParse(r.id).success)).toBe(true);
  });
});
