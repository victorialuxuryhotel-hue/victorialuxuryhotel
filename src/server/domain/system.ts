import { translateDbError } from "../db-errors";
import { type Db } from "../db";

/**
 * Background plumbing: the email outbox and the rate limiter. No actor: these
 * run for the system (scheduled job, after a response, anonymous visitors).
 */

export type OutboxRow = {
  id: string;
  kind: "booking_confirmed" | "payment_received" | "reservation_cancelled";
  reservation_id: string;
  payment_id: string | null;
  attempts: number;
};

/**
 * Claims due emails for sending. One statement: D1 runs it atomically, so two
 * senders can never claim the same row (the first pushes next_attempt_at into
 * the future). The attempt is counted up front, so a crash mid-send still
 * backs off: 1, 2, 4… minutes, at most 60.
 */
export async function claimOutbox(db: Db, opts: { limit?: number; reservationId?: string } = {}): Promise<OutboxRow[]> {
  try {
    const { results } = await db
      .prepare(
        `UPDATE email_outbox SET
           attempts = attempts + 1,
           next_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', printf('+%d minutes', min(60, 1 << attempts))),
           claim_id = ?1
         WHERE id IN (
           SELECT id FROM email_outbox
           WHERE status = 'pending' AND next_attempt_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             AND (?2 IS NULL OR reservation_id = ?2)
           ORDER BY created_at
           LIMIT ?3)
         RETURNING id, kind, reservation_id, payment_id, attempts`,
      )
      .bind(crypto.randomUUID(), opts.reservationId ?? null, opts.limit ?? 20)
      .all<OutboxRow>();
    return results;
  } catch (err) {
    throw translateDbError(err);
  }
}

/** Records the result. Anything other than sent/skipped is retried, up to 5 attempts. */
export async function finishOutbox(db: Db, id: string, status: "sent" | "skipped" | "retry", error?: string): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE email_outbox SET
           status = CASE WHEN ?1 IN ('sent', 'skipped') THEN ?1 WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
           sent_at = CASE WHEN ?1 = 'sent' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END,
           last_error = substr(?2, 1, 500),
           claim_id = NULL
         WHERE id = ?3`,
      )
      .bind(status, error ?? null, id)
      .run();
  } catch (err) {
    throw translateDbError(err);
  }
}

/** Fixed-window rate limit. Returns true if this hit is within the limit. */
export async function hitRateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_limit_hits (key, window_start, hits) VALUES (?, ?, 1)
         ON CONFLICT (key, window_start) DO UPDATE SET hits = hits + 1
         RETURNING hits`,
      )
      .bind(key, windowStart)
      .first<{ hits: number }>();
    // Housekeeping on ~1% of calls: drop windows older than a day.
    if (Math.random() < 0.01) {
      await db.prepare("DELETE FROM rate_limit_hits WHERE window_start < ?").bind(new Date(Date.now() - 86_400_000).toISOString()).run();
    }
    return (row?.hits ?? 0) <= limit;
  } catch (err) {
    throw translateDbError(err);
  }
}
