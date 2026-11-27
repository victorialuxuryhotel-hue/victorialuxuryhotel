// The self-check (rules section 4): finds problems, alerts each at most once a day, runs the daily
// checks once per business day. Never changes bookings or money.
import { describe, expect, it } from "vitest";
import { currentFindings, dailyChecks, findingsToAlert, AUDIENCE, forRole, urgentChecks } from "@/server/domain/self-check";
import { day, db, exec, insertReservation, makeCategory, q1 } from "./helpers";

async function inHouseOwing() {
  const c = await makeCategory(1);
  const r = await insertReservation({ categoryId: c.id, checkIn: day(-1), checkOut: day(2), roomId: c.roomIds[0], status: "confirmed" });
  await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
  await exec("UPDATE reservations SET extras_kobo = 500000 WHERE id = ?", r); // ₦5,000 of extras added after payment
  return r;
}

describe("self-check", () => {
  it("flags a guest in house who owes money, as urgent", async () => {
    const r = await inHouseOwing();
    const f = (await urgentChecks(db)).find((x) => x.key === `owes:${r}`);
    expect(f).toMatchObject({ urgent: true, check: "in_house_owes" });
    expect(f!.message).toMatch(/is in house and owes ₦5,000/);
  });

  it("flags a guest still checked in after their check-out date, daily", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(-4), checkOut: day(-1), roomId: c.roomIds[0], status: "confirmed" });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    expect((await dailyChecks(db)).find((x) => x.key === `overdue:${r}`)?.message).toMatch(/should have left Room/);
    expect((await currentFindings(db)).some((x) => x.key === `overdue:${r}`)).toBe(true);
  });

  it("each role sees only the problems it acts on; the data checks reach no hotel role", () => {
    const f = (check: string) => ({ key: check, check, urgent: true, message: check });
    const all = Object.keys(AUDIENCE).map(f);
    const seen = (role: Parameters<typeof forRole>[1]) => forRole(all, role).map((x) => x.check);
    expect(seen("finance")).toEqual(["in_house_owes", "online_payment_pending", "overpaid", "payments_to_confirm", "closing_unverified"]);
    expect(seen("general_manager")).toEqual(seen("owner"));
    expect(seen("owner")).not.toContain("invariant_two_in_room");
    expect(seen("owner")).not.toContain("invariant_unpaid_with_room");
    expect(seen("front_desk")).toEqual([]);
  });

  it("every check the self-check can raise has an audience, so none is shown to nobody by mistake", async () => {
    const src = (await import("node:fs")).readFileSync("src/server/domain/self-check.ts", "utf8");
    const raised = [...src.matchAll(/check: "([a-z_]+)"/g)].map((m) => m[1]!);
    expect(raised.length).toBeGreaterThan(5);
    expect(raised.filter((c) => !(c in AUDIENCE))).toEqual([]);
  });

  it("alerts each problem at most once a day, and again after a day if it's still there", async () => {
    const r = await inHouseOwing();
    const key = `owes:${r}`;
    const t0 = new Date();
    expect((await findingsToAlert(db, t0)).some((f) => f.key === key)).toBe(true);
    expect((await findingsToAlert(db, new Date(t0.getTime() + 10 * 60_000))).some((f) => f.key === key)).toBe(false);
    expect((await findingsToAlert(db, new Date(t0.getTime() + 25 * 3_600_000))).some((f) => f.key === key)).toBe(true);
  });

  it("runs the daily checks once per business day, and changes no bookings", async () => {
    await exec("DELETE FROM self_check_state WHERE key = '_daily_run'");
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(-4), checkOut: day(-1), roomId: c.roomIds[0], status: "confirmed" });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    const before = await q1<{ status: string; version: number }>("SELECT status, version FROM reservations WHERE id = ?", r);
    const t0 = new Date();
    expect((await findingsToAlert(db, t0)).some((f) => f.key === `overdue:${r}`)).toBe(true);
    await exec("DELETE FROM self_check_state WHERE key = ?", `overdue:${r}`); // as if never alerted
    expect((await findingsToAlert(db, new Date(t0.getTime() + 60_000))).some((f) => f.key === `overdue:${r}`)).toBe(false); // same day: daily checks don't run again
    expect(await q1("SELECT status, version FROM reservations WHERE id = ?", r)).toEqual(before);
  });
});
