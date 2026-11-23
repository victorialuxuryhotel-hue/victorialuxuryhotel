import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AppError } from "@/lib/errors";
import { StaleStateError, translateDbError } from "./db-errors";

/**
 * Database access (Cloudflare D1).
 *
 * D1 has no interactive transactions. Each business action therefore:
 *   1. reads what it needs and validates (fast, clear errors), then
 *   2. writes everything in ONE batch, which D1 runs atomically.
 * The rules that must never break (no double booking, capacity, status
 * transitions, immutable payments, receipt numbering, audit) are triggers in
 * the database, so they hold even if two requests race between steps 1 and 2:
 * D1 runs writes one at a time and a trigger re-checks inside the write.
 */

export type Db = D1Database;
export type Stmt = D1PreparedStatement;

/** The database for this request. Never cache it across requests (Workers rule). */
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

/** Who is acting. `null` = the system (webhook, scheduled job) or a website guest. */
/** Who is acting. `readOnly` is set while an owner views the app as front desk: every write refuses. */
export type Actor = { id: string; role: StaffRole; readOnly?: boolean } | null;
export type StaffRole = "owner" | "general_manager" | "front_desk" | "finance" | "restaurant_bar";

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

/**
 * Runs statements as one atomic batch, with the actor (and an optional
 * status-change reason) visible to audit and history triggers. Returns the
 * results of `stmts` (the context statements are stripped). Database rule
 * violations are translated into AppErrors with messages safe to show.
 */
export async function writeBatch(db: Db, actor: Actor, stmts: Stmt[], reason?: string | null): Promise<D1Result[]> {
  if (actor?.readOnly) throw new AppError("FORBIDDEN", VIEW_AS_READ_ONLY);
  const batch = [
    db.prepare("INSERT OR REPLACE INTO _ctx (id, actor_id, reason) VALUES (1, ?, ?)").bind(actor?.id ?? null, reason ?? null),
    ...stmts,
    db.prepare("DELETE FROM _ctx"),
  ];
  try {
    const results = await db.batch(batch);
    return results.slice(1, -1);
  } catch (err) {
    throw translateDbError(err);
  }
}

/** One row or null. */
export async function first<T>(db: Db, sql: string, ...params: unknown[]): Promise<T | null> {
  try {
    return await db.prepare(sql).bind(...params).first<T>();
  } catch (err) {
    throw translateDbError(err);
  }
}

/** All rows. */
export async function all<T>(db: Db, sql: string, ...params: unknown[]): Promise<T[]> {
  try {
    const { results } = await db.prepare(sql).bind(...params).all<T>();
    return results;
  } catch (err) {
    throw translateDbError(err);
  }
}

/** An activity-log insert, attributed through the request context. Put it in the same batch as the change. */
export function activity(db: Db, action: string, entityType: string, entityId: string | null, summary: string, metadata: Record<string, unknown> = {}): Stmt {
  return db
    .prepare(
      `INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
       VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
               CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
               ?, ?, ?, ?, ?)`,
    )
    .bind(action, entityType, entityId, summary, JSON.stringify(metadata));
}

/** Like `activity`, but writes only if the statement just before it in the batch changed a row. */
export function activityIfChanged(db: Db, action: string, entityType: string, entityId: string | null, summary: string, metadata: Record<string, unknown> = {}): Stmt {
  return db
    .prepare(
      `INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
       SELECT (SELECT actor_id FROM _ctx WHERE id = 1),
              CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
              ?, ?, ?, ?, ?
       WHERE changes() > 0`,
    )
    .bind(action, entityType, entityId, summary, JSON.stringify(metadata));
}

type Versioned = "reservations" | "payments" | "rooms";

/**
 * First statement of a batch: aborts the batch ('stale_state') unless the row
 * still has the version the action read. Pair with `retryOnStale`.
 */
export function assertVersion(db: Db, table: Versioned, id: string, version: number): Stmt {
  return db.prepare(`INSERT INTO _guard (ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND version = ?)`).bind(id, version);
}

/**
 * Runs read-decide-write action bodies, re-running them if a concurrent change
 * made what they read stale. Each attempt re-reads, so the final decision is
 * always made on current data.
 */
export async function retryOnStale<T>(body: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await body();
    } catch (err) {
      if (!(err instanceof StaleStateError)) throw err;
      if (i >= attempts) throw new AppError("CONFLICT", "This record was just changed by someone else. Reload and try again.", { cause: err });
    }
  }
}

/** Throws unless the actor is active staff with one of the roles. The data-layer twin of authorize(). */
export function requireRole(actor: Actor, roles: readonly StaffRole[]): asserts actor is NonNullable<Actor> {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (!roles.includes(actor.role)) throw new AppError("FORBIDDEN", "Your role does not allow this action.");
}

export const ALL_STAFF = ["owner", "general_manager", "front_desk"] as const;
export const MANAGERS = ["owner", "general_manager"] as const;
export const OWNER = ["owner"] as const;
export const FINANCE = ["owner", "general_manager", "finance"] as const;
export const POS_SELLERS = ["owner", "general_manager", "restaurant_bar"] as const;
export const POS_SETTLERS = ["owner", "general_manager", "front_desk"] as const;
export const STOCK_USERS = ["owner", "general_manager", "restaurant_bar"] as const;
export const EVENTS_STAFF = ["owner", "general_manager", "front_desk"] as const;

/** Shown when a change is attempted while viewing as front desk. */
export const VIEW_AS_READ_ONLY = "You're viewing as front desk, which is read-only. Exit view to make changes.";
