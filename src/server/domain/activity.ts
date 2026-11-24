import { hotelToday } from "@/lib/hotel-date";
import { MANAGERS, all, first, requireRole, type Actor, type Db } from "../db";
import { rangeDates, type ReportRange } from "./reports";

export type ActivityCategory = "all" | "bookings" | "payments" | "rooms" | "staff" | "exports";

export const ACTIVITY_CATEGORIES: Record<Exclude<ActivityCategory, "all">, { label: string; prefixes: string[] }> = {
  bookings: { label: "Bookings", prefixes: ["reservation."] },
  payments: { label: "Payments", prefixes: ["payment."] },
  rooms: { label: "Rooms", prefixes: ["room."] },
  staff: { label: "Staff & settings", prefixes: ["staff.", "settings.", "category.", "photo."] },
  exports: { label: "Downloads", prefixes: ["export."] },
};

export const ROUTINE_ACTIONS = ["payment.started", "room.status_updated", "staff.view_as_started", "staff.view_as_ended"] as const;

export function activityCategory(v: string | undefined): ActivityCategory {
  return v && v in ACTIVITY_CATEGORIES ? (v as ActivityCategory) : "all";
}

export type ActivityFilter = { range: ReportRange; category: ActivityCategory; actorId?: string | null; routine: boolean; page: number; size: number };

export type ActivityEntry = { id: number; created_at: string; day: string; action: string; summary: string; actor: string | null; actor_type: string };

/** Department managers see their own department's activity only. */
const SCOPE: Partial<Record<NonNullable<Actor>["role"], string[]>> = {
  hotel_manager: ["reservation.", "payment.", "room.", "guest.", "category.", "photo.", "settings.", "hall.", "extra.", "promo."],
};

function where(f: ActivityFilter, today: string, role: NonNullable<Actor>["role"]): { sql: string; params: unknown[] } {
  const { from, to } = rangeDates(f.range, today);
  const parts = ["date(a.created_at, '+1 hour') BETWEEN ? AND ?"];
  const params: unknown[] = [from, to];
  const scope = SCOPE[role];
  if (scope) {
    parts.push(`(${scope.map(() => "a.action LIKE ?").join(" OR ")})`);
    params.push(...scope.map((p) => `${p}%`));
  }
  if (f.category !== "all") {
    const prefixes = ACTIVITY_CATEGORIES[f.category].prefixes;
    parts.push(`(${prefixes.map(() => "a.action LIKE ?").join(" OR ")})`);
    params.push(...prefixes.map((p) => `${p}%`));
  }
  if (f.actorId) {
    parts.push("a.actor_id = ?");
    params.push(f.actorId);
  }
  if (!f.routine) {
    parts.push(`a.action NOT IN (${ROUTINE_ACTIONS.map(() => "?").join(", ")})`);
    params.push(...ROUTINE_ACTIONS);
  }
  return { sql: parts.join(" AND "), params };
}

export async function listActivity(db: Db, actor: Actor, f: ActivityFilter, today = hotelToday()): Promise<{ rows: ActivityEntry[]; total: number }> {
  requireRole(actor, MANAGERS);
  const w = where(f, today, actor.role);
  const page = Math.max(1, f.page);
  const [rows, count] = await Promise.all([
    all<ActivityEntry>(
      db,
      `SELECT a.id, a.created_at, date(a.created_at, '+1 hour') AS day, a.action, a.summary, s.full_name AS actor, a.actor_type
       FROM activity_log a LEFT JOIN staff_profiles s ON s.id = a.actor_id
       WHERE ${w.sql} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      ...w.params, f.size, (page - 1) * f.size,
    ),
    first<{ n: number }>(db, `SELECT count(*) AS n FROM activity_log a WHERE ${w.sql}`, ...w.params),
  ]);
  return { rows, total: count?.n ?? 0 };
}

export async function activityForCsv(db: Db, actor: Actor, f: Omit<ActivityFilter, "page" | "size">, today = hotelToday()): Promise<ActivityEntry[]> {
  requireRole(actor, MANAGERS);
  const w = where({ ...f, page: 1, size: 0 }, today, actor.role);
  return all<ActivityEntry>(
    db,
    `SELECT a.id, a.created_at, date(a.created_at, '+1 hour') AS day, a.action, a.summary, s.full_name AS actor, a.actor_type
     FROM activity_log a LEFT JOIN staff_profiles s ON s.id = a.actor_id
     WHERE ${w.sql} ORDER BY a.created_at, a.id LIMIT 20000`,
    ...w.params,
  );
}

export async function activityPeople(db: Db, actor: Actor): Promise<Array<{ id: string; name: string }>> {
  requireRole(actor, MANAGERS);
  return all<{ id: string; name: string }>(
    db,
    "SELECT s.id, s.full_name AS name FROM staff_profiles s WHERE EXISTS (SELECT 1 FROM activity_log a WHERE a.actor_id = s.id) ORDER BY s.full_name",
  );
}
