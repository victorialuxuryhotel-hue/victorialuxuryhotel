// Changes that cost more on a paid booking wait for their payment (docs/rules-and-edge-cases.md, 2.1).
// requestChange() in reservations.ts records one; this module applies it (with the payment that
// pays for it, or by the General Manager or Owner before payment) or cancels it.

import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { dbErrorToken } from "../db-errors";
import { activity, ALL_STAFF, first, MONEY_APPROVERS, requireRole, retryOnStale, writeBatch, assertVersion, type Actor, type Db, type Stmt } from "../db";
import { datesConflicts, datesStatements, dueOf, loadReservation, netPaid, roomMoveStatements, type ReservationRow } from "./reservations";

export type ChangeRow = {
  id: string;
  reservation_id: string;
  kind: "room" | "dates";
  room_id: string | null;
  check_in: string | null;
  check_out: string | null;
  amount_kobo: number;
  description: string;
  status: "pending" | "applied" | "cancelled";
};

const naira = (kobo: number) => formatNaira(kobo).replace(/\s/g, "");

export const pendingChange = (db: Db, reservationId: string) =>
  first<ChangeRow>(
    db,
    "SELECT id, reservation_id, kind, room_id, check_in, check_out, amount_kobo, description, status FROM reservation_changes WHERE reservation_id = ? AND status = 'pending'",
    reservationId,
  );

/**
 * The statements that make a pending change take effect, and mark it applied. Run in the same
 * batch as the payment that pays for it (paymentId), or on its own when approved before payment.
 */
export async function applyChangeStatements(
  db: Db,
  res: ReservationRow,
  change: ChangeRow,
  decision: { paymentId: string | null; decidedBy: string | null; note?: string | null; paidAfterKobo: number },
): Promise<Stmt[]> {
  const mark = db
    .prepare(
      `UPDATE reservation_changes SET status = 'applied', payment_id = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), note = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(decision.paymentId, decision.decidedBy, decision.note ?? null, change.id);
  const guard = db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0");

  if (change.kind === "room") {
    const room = await first<{ id: string; room_number: string; service_status: string }>(db, "SELECT id, room_number, service_status FROM rooms WHERE id = ?", change.room_id);
    if (!room || room.service_status !== "in_service") throw new AppError("UNAVAILABLE", "That room is no longer available. Cancel this change and choose another room.");
    const oldRoom = res.room_id ? await first<{ readiness: string }>(db, "SELECT readiness FROM rooms WHERE id = ?", res.room_id) : null;
    return [mark, guard, ...roomMoveStatements(db, res, room, oldRoom, change.amount_kobo)];
  }
  const plan = await datesStatements(db, res, change.check_in!, change.check_out!, decision.paidAfterKobo, ` (${naira(change.amount_kobo)} paid)`);
  if (plan.newDue - dueOf(res) !== change.amount_kobo) {
    throw new AppError("CONFLICT", "The price of this change has moved since it was asked for (extras or the booking changed). Cancel it and ask again.");
  }
  return [mark, guard, ...plan.stmts];
}

const conflictsFor = (change: ChangeRow) =>
  change.kind === "dates"
    ? datesConflicts(change.check_in!, change.check_out!)
    : {
        room_overlap: new AppError("CONFLICT", "That room has been given to another guest since. Cancel this change and choose another room."),
        no_capacity: new AppError("UNAVAILABLE", "That room type has filled up since. Cancel this change and choose another room."),
      };

/** Maps a rule error from applying a change to what staff should do; rethrows anything else. */
export function rethrowChangeError(err: unknown, change: ChangeRow): never {
  const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
  const mapped = token ? (conflictsFor(change) as Record<string, AppError>)[token] : undefined;
  if (mapped) throw mapped;
  throw err;
}

async function loadChange(db: Db, changeId: string): Promise<ChangeRow> {
  const change = await first<ChangeRow>(
    db,
    "SELECT id, reservation_id, kind, room_id, check_in, check_out, amount_kobo, description, status FROM reservation_changes WHERE id = ?",
    changeId,
  );
  if (!change) throw new AppError("NOT_FOUND", "That change wasn't found. Reload the booking.");
  if (change.status !== "pending") throw new AppError("CONFLICT", "That change has already been paid for or cancelled. Reload to see where it is now.");
  return change;
}

/** Anyone at the desk can cancel a change that hasn't been paid for. */
export async function cancelChange(db: Db, actor: Actor, changeId: string): Promise<void> {
  requireRole(actor, ALL_STAFF);
  const change = await loadChange(db, changeId);
  const res = await loadReservation(db, change.reservation_id);
  await writeBatch(db, actor, [
    db
      .prepare("UPDATE reservation_changes SET status = 'cancelled', decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'pending'")
      .bind(actor!.id, change.id),
    db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0"),
    activity(db, "reservation.change_cancelled", "reservation", res.id, `${res.reference}: change cancelled before payment (${change.description})`, { change_id: change.id }),
  ]);
}

/**
 * The General Manager or Owner can let a change take effect before it's paid, with a reason.
 * The amount is then owed, and check-out is refused until it is paid (rule I3).
 */
export async function applyChangeWithoutPayment(db: Db, actor: Actor, changeId: string, reason: string): Promise<void> {
  requireRole(actor, MONEY_APPROVERS);
  const why = (reason ?? "").trim();
  if (why.length < 5) throw new AppError("VALIDATION", "Give a reason (it's saved in Activity).");
  await retryOnStale(async () => {
    const change = await loadChange(db, changeId);
    const res = await loadReservation(db, change.reservation_id);
    const stmts = await applyChangeStatements(db, res, change, { paymentId: null, decidedBy: actor!.id, note: why, paidAfterKobo: await netPaid(db, res.id) });
    try {
      await writeBatch(
        db,
        actor,
        [
          assertVersion(db, "reservations", res.id, res.version),
          ...stmts,
          activity(db, "reservation.change_approved_unpaid", "reservation", res.id, `${res.reference}: ${change.description} applied before payment. ${naira(change.amount_kobo)} owed before check-out. Reason: ${why}`, {
            change_id: change.id,
            amount_kobo: change.amount_kobo,
          }),
        ],
        why,
      );
    } catch (err) {
      rethrowChangeError(err, change);
    }
  });
}
