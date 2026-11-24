import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AppError } from "@/lib/errors";
import { StaleStateError, translateDbError } from "./db-errors";

export type Db = D1Database;
export type Stmt = D1PreparedStatement;

export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

export type Actor = { id: string; role: StaffRole; readOnly?: boolean } | null;
export type StaffRole = "owner" | "general_manager" | "front_desk" | "finance" | "restaurant_bar" | "restaurant_bar_manager";

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

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

export async function first<T>(db: Db, sql: string, ...params: unknown[]): Promise<T | null> {
  try {
    return await db.prepare(sql).bind(...params).first<T>();
  } catch (err) {
    throw translateDbError(err);
  }
}

export async function all<T>(db: Db, sql: string, ...params: unknown[]): Promise<T[]> {
  try {
    const { results } = await db.prepare(sql).bind(...params).all<T>();
    return results;
  } catch (err) {
    throw translateDbError(err);
  }
}

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

export function assertVersion(db: Db, table: Versioned, id: string, version: number): Stmt {
  return db.prepare(`INSERT INTO _guard (ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND version = ?)`).bind(id, version);
}

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

export function requireRole(actor: Actor, roles: readonly StaffRole[]): asserts actor is NonNullable<Actor> {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (!roles.includes(actor.role)) throw new AppError("FORBIDDEN", "Your role does not allow this action.");
}

export const ALL_STAFF = ["owner", "general_manager", "front_desk"] as const;
export const MANAGERS = ["owner", "general_manager"] as const;
export const OWNER = ["owner"] as const;
export const FINANCE = ["owner", "general_manager", "finance"] as const;
export const POS_SELLERS = ["owner", "restaurant_bar", "restaurant_bar_manager"] as const;
export const POS_MANAGERS = ["owner", "restaurant_bar_manager"] as const;
export const POS_VIEWERS = ["owner", "general_manager", "finance", "restaurant_bar_manager"] as const;
export const STOCK_VIEWERS = ["owner", "general_manager", "finance", "restaurant_bar_manager"] as const;
export const EXPENSE_RECORDERS = ["owner", "general_manager", "finance", "restaurant_bar_manager"] as const;
export const EVENTS_STAFF = ["owner", "general_manager", "front_desk"] as const;

export const VIEW_AS_READ_ONLY = "You're viewing as front desk, which is read-only. Exit view to make changes.";

export function assertNetPaid(db: Db, reservationId: string, expected: number): Stmt {
  return db
    .prepare(
      `INSERT INTO _guard (ok) SELECT 0 WHERE (
         SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_kobo ELSE -amount_kobo END), 0)
         FROM payments WHERE reservation_id = ? AND status = 'successful') <> ?`,
    )
    .bind(reservationId, expected);
}
