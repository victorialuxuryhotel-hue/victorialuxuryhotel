// Staff sign-in by name and PIN on a shared station (FUNCTIONALITY.md section 1).
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { createStaffProfile, updateStaffProfile } from "@/server/domain/admin";
import { currentFindings, forRole } from "@/server/domain/self-check";
import {
  checkPin, createStation, endSession, lockedFor, pinSignIn, revokeStation, roster, sessionByToken, setStaffPin, stationByToken, type Station,
} from "@/server/domain/stations";
import { db, exec, gm, owner, q1, rejects } from "./helpers";

const PEPPER = "test-pepper";
const rand = () => crypto.randomUUID().slice(0, 8);

async function person(role: NonNullable<Actor>["role"], pin: string | null = "2580"): Promise<{ id: string; role: NonNullable<Actor>["role"] }> {
  const id = await createStaffProfile(db, owner, { fullName: `Test ${role} ${rand()}`, email: `${role}-${rand()}@example.com`, role });
  if (pin) {
    await setStaffPin(db, owner, id, pin, PEPPER);
    await exec("UPDATE staff_profiles SET pin_must_change = 0 WHERE id = ?", id);
  }
  return { id, role };
}

async function station(type: Station["type"] = "bar"): Promise<{ station: Station; token: string }> {
  const { token } = await createStation(db, gm, { name: `Bar ${rand()}`, type });
  return { station: (await stationByToken(db, token))!, token };
}

async function signIn(st: Station, staffId: string, pin = "2580") {
  const r = await pinSignIn(db, st, { staffId, pin }, PEPPER);
  if (r.status !== "signed_in") throw new Error("expected a session");
  return r.token;
}

describe("stations", () => {
  it("only the owner or GM sets one up; the browser token is stored only as a hash", async () => {
    const desk = await person("front_desk");
    await rejects(createStation(db, desk, { name: "Front desk 1", type: "desk" }), /owner or the General Manager/);
    const { station: st, token } = await station("desk");
    const row = await q1<{ token_hash: string }>("SELECT token_hash FROM stations WHERE id = ?", st.id);
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await stationByToken(db, "x".repeat(43))).toBeNull();
  });

  it("lists only the names that fit the station: the till shows restaurant & bar staff and their manager", async () => {
    const seller = await person("restaurant_bar");
    const lead = await person("restaurant_bar_manager");
    const desk = await person("front_desk");
    const bar = (await roster(db, (await station("bar")).station)).map((p) => p.id);
    expect(bar).toEqual(expect.arrayContaining([seller.id, lead.id]));
    expect(bar).not.toContain(desk.id);
    const front = (await roster(db, (await station("desk")).station)).map((p) => p.id);
    expect(front).toContain(desk.id);
    expect(front).not.toContain(seller.id);
    await rejects(pinSignIn(db, (await station("desk")).station, { staffId: seller.id, pin: "2580" }, PEPPER), /doesn't sign in on this computer/);
  });
});

describe("PIN sign-in", () => {
  it("the right PIN starts a session that resolves to that person; a wrong PIN doesn't", async () => {
    const seller = await person("restaurant_bar");
    const { station: st } = await station();
    await rejects(pinSignIn(db, st, { staffId: seller.id, pin: "9999" }, PEPPER), /Wrong PIN\. 4 tries left/);
    const token = await signIn(st, seller.id);
    const s = await sessionByToken(db, st, token);
    expect(s?.staff).toMatchObject({ id: seller.id, role: "restaurant_bar" });
    expect(await sessionByToken(db, st, "y".repeat(43))).toBeNull();
  });

  it("5 wrong PINs lock that person on that station for 15 minutes, and the owner and GM are told", async () => {
    const seller = await person("restaurant_bar");
    const { station: st } = await station();
    for (let i = 0; i < 4; i++) await rejects(pinSignIn(db, st, { staffId: seller.id, pin: "1111" }, PEPPER), /Wrong PIN/);
    await rejects(pinSignIn(db, st, { staffId: seller.id, pin: "1111" }, PEPPER), /5 wrong PINs.*locked on this computer for 15 minutes/);
    // Even the right PIN is refused now, without being checked.
    await rejects(pinSignIn(db, st, { staffId: seller.id, pin: "2580" }, PEPPER), /Too many wrong PINs.*Try again in 15 minutes/);
    expect(await lockedFor(db, st.id, seller.id, "sign_in")).toBe(15);
    // The lock is per station: another computer still works.
    expect(await signIn((await station()).station, seller.id)).toBeTruthy();
    // After 15 minutes it lifts.
    expect(await lockedFor(db, st.id, seller.id, "sign_in", 5, Date.now() + 16 * 60_000)).toBe(0);

    const findings = await currentFindings(db);
    const seen = (role: NonNullable<Actor>["role"]) => forRole(findings, role).filter((f) => f.check === "pin_lockout").map((f) => f.message);
    expect(seen("owner").some((m) => m.includes("locked out"))).toBe(true);
    expect(seen("general_manager").length).toBe(seen("owner").length);
    expect(seen("restaurant_bar_manager")).toEqual([]);
  });

  it("a PIN set by the owner must be changed at the first sign-in", async () => {
    const seller = await person("restaurant_bar", null);
    await setStaffPin(db, owner, seller.id, "4826", PEPPER);
    const { station: st } = await station();
    expect(await pinSignIn(db, st, { staffId: seller.id, pin: "4826" }, PEPPER)).toEqual({ status: "choose_new" });
    await rejects(pinSignIn(db, st, { staffId: seller.id, pin: "4826", newPin: "4826" }, PEPPER), /different from the one the owner gave/);
    const r = await pinSignIn(db, st, { staffId: seller.id, pin: "4826", newPin: "7391" }, PEPPER);
    expect(r.status).toBe("signed_in");
    await rejects(pinSignIn(db, st, { staffId: seller.id, pin: "4826" }, PEPPER), /Wrong PIN/);
    expect((await pinSignIn(db, st, { staffId: seller.id, pin: "7391" }, PEPPER)).status).toBe("signed_in");
  });

  it("only the owner sets or resets PINs, and the PIN itself is never stored", async () => {
    const seller = await person("restaurant_bar", null);
    await rejects(setStaffPin(db, gm, seller.id, "4826", PEPPER), /Only the owner/);
    await rejects(setStaffPin(db, owner, seller.id, "1234", PEPPER), /straight run/);
    await setStaffPin(db, owner, seller.id, "4826", PEPPER);
    const row = await q1<{ pin_hash: string; pin_must_change: number }>("SELECT pin_hash, pin_must_change FROM staff_profiles WHERE id = ?", seller.id);
    expect(row.pin_hash).not.toContain("4826");
    expect(row.pin_must_change).toBe(1);
    const log = await q1<{ n: number }>("SELECT count(*) AS n FROM activity_log WHERE entity_id = ? AND (summary LIKE '%4826%' OR metadata LIKE '%4826%')", seller.id);
    expect(log.n).toBe(0);
  });

  it("the idle lock ends the session on the server, and Lock ends it at once", async () => {
    const seller = await person("restaurant_bar");
    const { station: st } = await station(); // a till: 5 minutes idle (+1 grace)
    const token = await signIn(st, seller.id);
    expect(await sessionByToken(db, st, token, Date.now() + 4 * 60_000)).not.toBeNull();
    // That call counted as activity; 7 idle minutes after it the session is gone for good.
    expect(await sessionByToken(db, st, token, Date.now() + 12 * 60_000)).toBeNull();
    expect(await sessionByToken(db, st, token)).toBeNull();
    expect((await q1<{ end_reason: string }>("SELECT end_reason FROM staff_sessions WHERE station_id = ? ORDER BY started_at DESC LIMIT 1", st.id)).end_reason).toBe("idle");

    const again = await signIn(st, seller.id);
    await endSession(db, st, again, "lock");
    expect(await sessionByToken(db, st, again)).toBeNull();
  });

  it("switching user ends the first person's session; one person at a time per station", async () => {
    const a = await person("restaurant_bar");
    const b = await person("restaurant_bar");
    const { station: st } = await station();
    const ta = await signIn(st, a.id);
    const tb = await signIn(st, b.id);
    expect(await sessionByToken(db, st, ta)).toBeNull();
    expect((await sessionByToken(db, st, tb))?.staff.id).toBe(b.id);
  });

  it("a revoked station signs everyone out and stops working", async () => {
    const seller = await person("restaurant_bar");
    const { station: st, token: stationToken } = await station();
    const token = await signIn(st, seller.id);
    await rejects(revokeStation(db, gm, st.id), /role can't do this/);
    await revokeStation(db, owner, st.id);
    expect(await stationByToken(db, stationToken)).toBeNull();
    expect(await sessionByToken(db, st, token)).toBeNull();
    expect((await q1<{ end_reason: string }>("SELECT end_reason FROM staff_sessions WHERE station_id = ?", st.id)).end_reason).toBe("revoked");
  });

  it("a deactivated staff member's sessions end at once", async () => {
    const seller = await person("restaurant_bar");
    const { station: st } = await station();
    const token = await signIn(st, seller.id);
    await updateStaffProfile(db, owner, { staffId: seller.id, role: "restaurant_bar", isActive: false });
    expect(await sessionByToken(db, st, token)).toBeNull();
    await rejects(checkPin(db, st, seller.id, "2580", "sign_in", PEPPER), /can't sign in here/);
  });

  it("a station pauses after 15 wrong PINs across names", async () => {
    const { station: st } = await station();
    const people = await Promise.all([1, 2, 3, 4, 5].map(() => person("restaurant_bar")));
    for (const p of people) for (let i = 0; i < 3; i++) await rejects(pinSignIn(db, st, { staffId: p.id, pin: "1111" }, PEPPER), /Wrong PIN/);
    const fresh = await person("restaurant_bar");
    await rejects(pinSignIn(db, st, { staffId: fresh.id, pin: "2580" }, PEPPER), /Too many wrong PINs on this computer/);
  });
});
