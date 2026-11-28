// Shared stations and sign-in by name and PIN (FUNCTIONALITY.md section 1; agreement, Schedule A).
// A station is a computer set up once by the owner or GM. On it, staff tap their name and enter their
// PIN; that starts a staff session, and every action is recorded against that person. The browser
// holds random tokens (httpOnly cookies); the database keeps only their SHA-256.

import type { StaffRole } from "@/domain/status";
import { can } from "@/lib/auth/permissions";
import { hashPin, newToken, pinProblem, tokenHash, verifyPin } from "@/lib/auth/pin";
import { AppError } from "@/lib/errors";
import { activity, all, first, requireRole, uuid, writeBatch, type Actor, type Db } from "../db";
import { ROLE } from "./admin";

export type StationType = "desk" | "restaurant" | "bar" | "office";
export type Station = { id: string; name: string; type: StationType };
export type SessionStaff = { id: string; fullName: string; email: string; role: StaffRole; mustChange: boolean; startedAt?: string };

export const STATION_TYPES: Record<StationType, string> = { desk: "Front desk", restaurant: "Restaurant till", bar: "Bar till", office: "Office" };

/** Who a station lists: tills show restaurant & bar staff and their manager; the desk shows front desk and above. */
export const STATION_ROLES: Record<StationType, readonly StaffRole[]> = {
  bar: ["restaurant_bar", "restaurant_bar_manager"],
  restaurant: ["restaurant_bar", "restaurant_bar_manager"],
  desk: ["front_desk", "hotel_manager", "general_manager", "owner"],
  office: ["owner", "general_manager", "hotel_manager", "finance"],
};

export const isTill = (type: StationType) => type === "bar" || type === "restaurant";

/** 5 wrong PINs in 15 minutes lock that person on that station for 15 minutes. */
export const PIN_LOCK = { tries: 5, minutes: 15 } as const;
/** However many names are tried, a station pauses after this many wrong PINs in 15 minutes. */
export const STATION_PAUSE_TRIES = 15;
/** A session also ends after this long, however busy (a full shift and a bit). */
export const SESSION_MAX_HOURS = 14;

const nowIso = () => new Date().toISOString();
const minutesAgo = (m: number, from = Date.now()) => new Date(from - m * 60_000).toISOString();

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

export async function createStation(db: Db, actor: Actor, v: { name: string; type: StationType }): Promise<{ id: string; token: string }> {
  if (!actor || !can(actor.role, "stations.manage")) throw new AppError("FORBIDDEN", "Only the owner or the General Manager can set up a station.");
  const name = v.name.trim();
  if (name.length < 2 || name.length > 40) throw new AppError("VALIDATION", "Give the station a name, like “Bar till” or “Front desk 1”.", { fieldErrors: { name: ["Enter a name"] } });
  if (!(v.type in STATION_TYPES)) throw new AppError("VALIDATION", "Choose what this computer is used for.", { fieldErrors: { type: ["Choose one"] } });
  const id = uuid();
  const token = newToken();
  await writeBatch(db, actor, [
    db.prepare("INSERT INTO stations (id, name, type, token_hash, created_by) VALUES (?, ?, ?, ?, ?)").bind(id, name, v.type, await tokenHash(token), actor.id),
    activity(db, "station.created", "station", id, `Station set up: ${name} (${STATION_TYPES[v.type]})`, { type: v.type }),
  ]);
  return { id, token };
}

/** The owner revokes a station; everyone signed in on it is signed out (trigger in 0029). */
export async function revokeStation(db: Db, actor: Actor, id: string): Promise<void> {
  requireRole(actor, ["owner"]);
  const s = await first<{ name: string; revoked_at: string | null }>(db, "SELECT name, revoked_at FROM stations WHERE id = ?", id);
  if (!s) throw new AppError("NOT_FOUND", "Station not found.");
  if (s.revoked_at) return;
  await writeBatch(db, actor, [
    db.prepare("UPDATE stations SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL").bind(nowIso(), actor.id, id),
    activity(db, "station.revoked", "station", id, `Station revoked: ${s.name}`),
  ]);
}

export type StationRow = Station & { created_at: string; created_by_name: string | null; last_seen_at: string | null; revoked_at: string | null; signed_in: string | null };

export async function listStations(db: Db, actor: Actor): Promise<StationRow[]> {
  if (!actor || !can(actor.role, "stations.manage")) throw new AppError("FORBIDDEN", "Only the owner or the General Manager can see the stations.");
  return all<StationRow>(
    db,
    `SELECT st.id, st.name, st.type, st.created_at, c.full_name AS created_by_name, st.last_seen_at, st.revoked_at,
            (SELECT sp.full_name FROM staff_sessions ss JOIN staff_profiles sp ON sp.id = ss.staff_id
              WHERE ss.station_id = st.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS signed_in
     FROM stations st LEFT JOIN staff_profiles c ON c.id = st.created_by
     ORDER BY st.revoked_at IS NOT NULL, st.created_at DESC`,
  );
}

/** The station this browser was set up as, or null (unknown or revoked token). */
export async function stationByToken(db: Db, token: string | undefined): Promise<Station | null> {
  if (!token || token.length < 32 || token.length > 64) return null;
  const s = await first<Station & { last_seen_at: string | null }>(db, "SELECT id, name, type, last_seen_at FROM stations WHERE token_hash = ? AND revoked_at IS NULL", await tokenHash(token));
  if (!s) return null;
  if (!s.last_seen_at || s.last_seen_at < minutesAgo(5)) await db.prepare("UPDATE stations SET last_seen_at = ? WHERE id = ?").bind(nowIso(), s.id).run();
  return { id: s.id, name: s.name, type: s.type };
}

export async function idleMinutes(db: Db, type: StationType): Promise<number> {
  const r = await first<{ till: number; desk: number }>(db, "SELECT idle_lock_till_minutes AS till, idle_lock_desk_minutes AS desk FROM hotel_settings WHERE id = 1");
  return isTill(type) ? (r?.till ?? 5) : (r?.desk ?? 10);
}

// ---------------------------------------------------------------------------
// The name grid
// ---------------------------------------------------------------------------

export type RosterEntry = { id: string; fullName: string; role: StaffRole; hasPin: boolean; lockedMinutes: number };

/** The names a station shows: active staff whose role fits it. Someone without a PIN is shown but can't sign in. */
export async function roster(db: Db, station: Station): Promise<RosterEntry[]> {
  const roles = STATION_ROLES[station.type];
  const rows = await all<{ id: string; full_name: string; role: StaffRole; has_pin: number }>(
    db,
    `SELECT id, full_name, role, has_pin FROM (SELECT id, full_name, ${ROLE} AS role, pin_hash IS NOT NULL AS has_pin FROM staff_profiles WHERE is_active = 1)
     WHERE role IN (${roles.map(() => "?").join(", ")}) ORDER BY full_name`,
    ...roles,
  );
  return Promise.all(
    rows.map(async (r) => ({ id: r.id, fullName: r.full_name, role: r.role, hasPin: Boolean(r.has_pin), lockedMinutes: await lockedFor(db, station.id, r.id, "sign_in") })),
  );
}

/** Minutes left on a lockout for this person on this station (0 = not locked). */
export async function lockedFor(db: Db, stationId: string, staffId: string, purpose: "sign_in" | "approve", tries: number = PIN_LOCK.tries, at = Date.now()): Promise<number> {
  const rows = await all<{ at: string }>(
    db,
    `SELECT at FROM pin_attempts WHERE station_id = ? AND staff_id = ? AND purpose = ? AND ok = 0 AND at > ?
       AND at > coalesce((SELECT max(at) FROM pin_attempts WHERE station_id = ?1 AND staff_id = ?2 AND purpose = ?3 AND ok = 1), '')
     ORDER BY at DESC`,
    stationId,
    staffId,
    purpose,
    minutesAgo(PIN_LOCK.minutes, at),
  );
  if (rows.length < tries) return 0;
  const lockedAt = Date.parse(rows[tries - 1]!.at); // the try that reached the limit
  return Math.max(1, Math.ceil((lockedAt + PIN_LOCK.minutes * 60_000 - at) / 60_000));
}

async function stationPaused(db: Db, stationId: string, at = Date.now()): Promise<boolean> {
  const r = await first<{ n: number }>(db, "SELECT count(*) AS n FROM pin_attempts WHERE station_id = ? AND ok = 0 AND at > ?", stationId, minutesAgo(PIN_LOCK.minutes, at));
  return (r?.n ?? 0) >= STATION_PAUSE_TRIES;
}

type PinOwner = { id: string; full_name: string; email: string; role: StaffRole; pin_hash: string | null; pin_must_change: number; is_active: number };
const loadPinOwner = (db: Db, staffId: string) =>
  first<PinOwner>(db, `SELECT id, full_name, email, ${ROLE} AS role, pin_hash, pin_must_change, is_active FROM staff_profiles WHERE id = ?`, staffId);

/**
 * Checks one PIN and records the try. Locked people and paused stations are refused before the PIN is
 * even checked, so guessing gains nothing. `tries` is the limit for this purpose (5 to sign in, 3 to approve).
 */
export async function checkPin(
  db: Db,
  station: Station,
  staffId: string,
  pin: string,
  purpose: "sign_in" | "approve",
  pepper: string,
  tries: number = PIN_LOCK.tries,
): Promise<PinOwner> {
  const person = await loadPinOwner(db, staffId);
  if (!person || !person.is_active) throw new AppError("NOT_FOUND", "That name can't sign in here. Pick your name again.");
  if (!person.pin_hash) throw new AppError("VALIDATION", "You don't have a PIN yet. Ask the owner to set one.");
  if (await stationPaused(db, station.id)) throw new AppError("RATE_LIMITED", `Too many wrong PINs on this computer. Wait ${PIN_LOCK.minutes} minutes, or ask a manager.`);
  const locked = await lockedFor(db, station.id, staffId, purpose, tries);
  if (locked) throw new AppError("RATE_LIMITED", `Too many wrong PINs for ${first_(person.full_name)}. Try again in ${locked} minute${locked === 1 ? "" : "s"}, or ask the owner to reset it.`);

  const right = await verifyPin(pin, person.pin_hash, pepper);
  await db.prepare("INSERT INTO pin_attempts (station_id, staff_id, purpose, ok) VALUES (?, ?, ?, ?)").bind(station.id, staffId, purpose, right ? 1 : 0).run();
  if (right) return person;

  const nowLocked = await lockedFor(db, station.id, staffId, purpose, tries);
  if (nowLocked) {
    await writeBatch(db, null, [
      activity(db, purpose === "sign_in" ? "staff.pin_locked" : "staff.approval_refused", "staff", staffId, purpose === "sign_in"
        ? `${person.full_name} was locked out of ${station.name} after ${tries} wrong PINs`
        : `A void needing ${person.full_name}'s approval was refused after ${tries} wrong PINs on ${station.name}`, { station_id: station.id }),
    ]);
    throw new AppError("RATE_LIMITED", purpose === "sign_in"
      ? `That's ${tries} wrong PINs. ${first_(person.full_name)} is locked on this computer for ${PIN_LOCK.minutes} minutes. The owner and GM have been told.`
      : `That's ${tries} wrong PINs. The void is refused; ${first_(person.full_name)} will be told at their next sign-in.`);
  }
  const used = await first<{ n: number }>(
    db,
    `SELECT count(*) AS n FROM pin_attempts WHERE station_id = ? AND staff_id = ? AND purpose = ? AND ok = 0 AND at > ?
       AND at > coalesce((SELECT max(at) FROM pin_attempts WHERE station_id = ?1 AND staff_id = ?2 AND purpose = ?3 AND ok = 1), '')`,
    station.id,
    staffId,
    purpose,
    minutesAgo(PIN_LOCK.minutes),
  );
  const left = tries - (used?.n ?? 0);
  throw new AppError("VALIDATION", `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`, { fieldErrors: { pin: ["Wrong PIN"] } });
}

const first_ = (name: string) => name.split(" ")[0] ?? name;

export type SignInResult = { status: "signed_in"; token: string; staff: SessionStaff } | { status: "choose_new" };

/**
 * Tap a name, enter the PIN. If the owner set or reset the PIN, the person must choose their own
 * first: the first call answers "choose_new" without starting a session, and the second call carries
 * both the old PIN and the new one.
 */
export async function pinSignIn(db: Db, station: Station, v: { staffId: string; pin: string; newPin?: string | null }, pepper: string): Promise<SignInResult> {
  if (!STATION_ROLES[station.type].length) throw new AppError("FORBIDDEN", "Nobody signs in on this station.");
  const fits = await first<{ role: StaffRole }>(db, `SELECT ${ROLE} AS role FROM staff_profiles WHERE id = ?`, v.staffId);
  if (!fits || !STATION_ROLES[station.type].includes(fits.role)) throw new AppError("FORBIDDEN", "That name doesn't sign in on this computer.");
  const person = await checkPin(db, station, v.staffId, v.pin, "sign_in", pepper);

  const stmts = [];
  if (person.pin_must_change) {
    if (!v.newPin) return { status: "choose_new" };
    const problem = pinProblem(v.newPin);
    if (problem) throw new AppError("VALIDATION", problem, { fieldErrors: { newPin: [problem] } });
    if (v.newPin === v.pin) throw new AppError("VALIDATION", "Choose a PIN different from the one the owner gave you.", { fieldErrors: { newPin: ["Choose a different PIN"] } });
    stmts.push(db.prepare("UPDATE staff_profiles SET pin_hash = ?, pin_must_change = 0 WHERE id = ?").bind(await hashPin(v.newPin, pepper), person.id));
    stmts.push(activity(db, "staff.pin_changed", "staff", person.id, `${person.full_name} chose their own PIN`));
  }
  const token = newToken();
  const actor = { id: person.id, role: person.role };
  await writeBatch(db, actor, [
    // One person at a time on a station: whoever was signed in is switched out.
    db.prepare("UPDATE staff_sessions SET ended_at = ?, end_reason = 'switch' WHERE station_id = ? AND ended_at IS NULL").bind(nowIso(), station.id),
    ...stmts,
    db.prepare("INSERT INTO staff_sessions (id, token_hash, station_id, staff_id) VALUES (?, ?, ?, ?)").bind(uuid(), await tokenHash(token), station.id, person.id),
  ]);
  return { status: "signed_in", token, staff: { id: person.id, fullName: person.full_name, email: person.email, role: person.role, mustChange: false } };
}

/**
 * The person signed in on this station, or null. A session ends when it has been idle longer than the
 * station's idle lock (plus a minute's grace for the heartbeat), after SESSION_MAX_HOURS, or when the
 * person is deactivated or the station revoked (triggers). Busy sessions are touched at most every 30 s.
 */
export async function sessionByToken(db: Db, station: Station, token: string | undefined, at = Date.now()): Promise<{ sessionId: string; staff: SessionStaff } | null> {
  if (!token || token.length < 32 || token.length > 64) return null;
  const s = await first<{ id: string; started_at: string; last_seen_at: string; staff_id: string; full_name: string; email: string; role: StaffRole; is_active: number; pin_must_change: number }>(
    db,
    `SELECT ss.id, ss.started_at, ss.last_seen_at, sp.id AS staff_id, sp.full_name, sp.email, ${ROLE} AS role, sp.is_active, sp.pin_must_change
     FROM staff_sessions ss JOIN staff_profiles sp ON sp.id = ss.staff_id
     WHERE ss.token_hash = ? AND ss.station_id = ? AND ss.ended_at IS NULL`,
    await tokenHash(token),
    station.id,
  );
  if (!s) return null;
  const idle = (await idleMinutes(db, station.type)) + 1;
  const reason = !s.is_active ? "deactivated" : s.last_seen_at < minutesAgo(idle, at) ? "idle" : s.started_at < minutesAgo(SESSION_MAX_HOURS * 60, at) ? "expired" : null;
  if (reason) {
    await endSessionById(db, s.id, reason);
    return null;
  }
  if (s.last_seen_at < new Date(at - 30_000).toISOString()) {
    await db.prepare("UPDATE staff_sessions SET last_seen_at = ? WHERE id = ? AND ended_at IS NULL").bind(new Date(at).toISOString(), s.id).run();
  }
  return { sessionId: s.id, staff: { id: s.staff_id, fullName: s.full_name, email: s.email, role: s.role, mustChange: Boolean(s.pin_must_change), startedAt: s.started_at } };
}

async function endSessionById(db: Db, id: string, reason: "lock" | "idle" | "switch" | "expired" | "deactivated"): Promise<void> {
  await db.prepare("UPDATE staff_sessions SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL").bind(nowIso(), reason, id).run();
}

/** Lock (button) or the idle timer on the screen: ends the session on the server too. */
export async function endSession(db: Db, station: Station, token: string | undefined, reason: "lock" | "idle"): Promise<void> {
  if (!token) return;
  await db
    .prepare("UPDATE staff_sessions SET ended_at = ?, end_reason = ? WHERE token_hash = ? AND station_id = ? AND ended_at IS NULL")
    .bind(nowIso(), reason, await tokenHash(token), station.id)
    .run();
}

// ---------------------------------------------------------------------------
// Setting PINs (owner only)
// ---------------------------------------------------------------------------

/** The owner sets or resets someone's PIN. They choose their own at their next sign-in. */
export async function setStaffPin(db: Db, actor: Actor, staffId: string, pin: string, pepper: string): Promise<void> {
  if (!actor || !can(actor.role, "staff.manage")) throw new AppError("FORBIDDEN", "Only the owner can set or reset PINs.");
  const problem = pinProblem(pin);
  if (problem) throw new AppError("VALIDATION", problem, { fieldErrors: { pin: [problem] } });
  const person = await first<{ full_name: string; is_active: number }>(db, "SELECT full_name, is_active FROM staff_profiles WHERE id = ?", staffId);
  if (!person) throw new AppError("NOT_FOUND", "Staff member not found.");
  if (!person.is_active) throw new AppError("VALIDATION", "Restore their access before setting a PIN.");
  await writeBatch(db, actor, [
    db.prepare("UPDATE staff_profiles SET pin_hash = ?, pin_must_change = ? WHERE id = ?").bind(await hashPin(pin, pepper), staffId === actor.id ? 0 : 1, staffId),
    // A reset PIN signs them out everywhere.
    db.prepare("UPDATE staff_sessions SET ended_at = ?, end_reason = 'switch' WHERE staff_id = ? AND ended_at IS NULL").bind(nowIso(), staffId),
    activity(db, "staff.pin_set", "staff", staffId, `PIN ${staffId === actor.id ? "changed" : "set"} for ${person.full_name}`),
  ]);
}

/** Lockouts and refused approvals in the last day, for the owner's and GM's "Anything wrong?". */
export async function recentLockouts(db: Db, hours = 24): Promise<{ id: number; action: string; summary: string; created_at: string }[]> {
  return all(db, "SELECT id, action, summary, created_at FROM activity_log WHERE action IN ('staff.pin_locked', 'staff.approval_refused', 'station.revoked') AND created_at > ? ORDER BY created_at DESC", minutesAgo(hours * 60));
}

/** Voids refused because of 3 wrong PINs under this manager's name, before their current session: they're told at sign-in. */
export async function refusedApprovals(db: Db, staffId: string, sessionStartedAt: string): Promise<{ summary: string; created_at: string }[]> {
  return all(
    db,
    `SELECT summary, created_at FROM activity_log WHERE action = 'staff.approval_refused' AND entity_id = ? AND created_at < ? AND created_at > ? ORDER BY created_at DESC LIMIT 5`,
    staffId,
    sessionStartedAt,
    new Date(Date.parse(sessionStartedAt) - 24 * 3_600_000).toISOString(),
  );
}
