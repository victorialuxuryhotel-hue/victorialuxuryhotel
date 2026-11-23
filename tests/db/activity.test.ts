import { describe, expect, it } from "vitest";
import { listActivity } from "@/server/domain/activity";
import { addDays, hotelToday } from "@/lib/hotel-date";
import { db, desk, exec, gm, owner, rejects } from "./helpers";

const tag = crypto.randomUUID().slice(0, 8);

async function log(action: string, at: string, actorId: string | null, summary: string) {
  await exec(
    "INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata, created_at) VALUES (?, ?, ?, 'test', NULL, ?, '{}', ?)",
    actorId, actorId ? "staff" : "system", action, `${tag} ${summary}`, at,
  );
}

const mine = (rows: Array<{ summary: string }>) => rows.filter((r) => r.summary.startsWith(tag)).map((r) => r.summary.slice(tag.length + 1));

describe("activity log screen", () => {
  it("filters by Lagos day, category, person and routine, newest first", async () => {
    const today = hotelToday();
    await log("reservation.checked_in", `${addDays(today, -1)}T23:30:00.000Z`, gm!.id, "just after Lagos midnight");
    await log("payment.recorded", `${today}T09:00:00.000Z`, desk!.id, "desk payment");
    await log("payment.started", `${today}T09:05:00.000Z`, null, "routine attempt");
    await log("room.status_updated", `${today}T09:10:00.000Z`, desk!.id, "routine cleaning");
    await log("settings.updated", `${addDays(today, -1)}T10:00:00.000Z`, owner!.id, "yesterday settings");

    const base = { range: "today" as const, category: "all" as const, routine: false, page: 1, size: 100000 };
    expect(mine((await listActivity(db, gm, base)).rows)).toEqual(["desk payment", "just after Lagos midnight"]);
    expect(mine((await listActivity(db, gm, { ...base, routine: true })).rows)).toEqual(["routine cleaning", "routine attempt", "desk payment", "just after Lagos midnight"]);
    expect(mine((await listActivity(db, gm, { ...base, category: "payments", routine: true })).rows)).toEqual(["routine attempt", "desk payment"]);
    expect(mine((await listActivity(db, gm, { ...base, actorId: desk!.id, routine: true })).rows)).toEqual(["routine cleaning", "desk payment"]);
    expect(mine((await listActivity(db, gm, { ...base, range: "14d", category: "staff" })).rows)).toEqual(["yesterday settings"]);
  });

  it("pages with a total", async () => {
    const today = hotelToday();
    for (let i = 0; i < 5; i++) await log("reservation.updated", `${today}T08:0${i}:00.000Z`, null, `page item ${i}`);
    const f = { range: "today" as const, category: "bookings" as const, routine: false, page: 1, size: 2 };
    const first = await listActivity(db, owner, f);
    const second = await listActivity(db, owner, { ...f, page: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.total).toBeGreaterThanOrEqual(5);
    expect(second.rows[0]!.id).not.toBe(first.rows[0]!.id);
  });

  it("is for managers only", async () => {
    await rejects(listActivity(db, desk, { range: "today", category: "all", routine: false, page: 1, size: 20 }), /role/i);
  });
});
