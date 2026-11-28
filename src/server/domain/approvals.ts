// Approvals: refunds and exceptions for the General Manager or Owner (FUNCTIONALITY.md section 7, design X10).
// One list: refund requests (from the desk, or a no-show's unused nights), unpaid changes waiting for payment, and
// guests let go owing at check-out. Each is approved or declined with a reason; both are kept.

import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { activity, all, first, uuid, writeBatch, type Actor, type Db } from "../db";
import { applyChangeWithoutPayment, cancelChange } from "./changes";
import { refundLimit } from "./front-desk";

export type ApprovalKind = "refund" | "no_show" | "unpaid_change" | "leave_owing";
export type ApprovalState = "waiting" | "approved" | "declined";

export type Approval = {
  kind: ApprovalKind; id: string; reservationId: string; reference: string; guestName: string; category: string;
  what: string; askedBy: string; askedAt: string; amountKobo: number; method?: string | null;
  decidedBy?: string | null; decidedAt?: string | null; note?: string | null;
  // Refunds: the facts the decision is made on.
  paidKobo?: number; usedKobo?: number; nights?: number; limitKobo?: number;
};

function needApprover(actor: Actor): asserts actor is NonNullable<Actor> {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (!can(actor.role, "payments.approve")) throw new AppError("FORBIDDEN", "Only the General Manager or the Owner approves refunds and exceptions.");
}

const RES = `JOIN reservations r ON r.id = x.reservation_id JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id`;

export async function listApprovals(db: Db, actor: Actor, state: ApprovalState): Promise<Approval[]> {
  needApprover(actor);
  const refundWhere = state === "waiting" ? "x.decided_at IS NULL" : `x.decision = '${state}'`;
  const refunds = await all<{
    id: string; reservation_id: string; reference: string; guest_name: string; category: string; amount_kobo: number; method: string; reason: string; source: string;
    asked_by: string | null; requested_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; check_in: string; check_out: string;
  }>(
    db,
    `SELECT x.id, x.reservation_id, r.reference, g.full_name AS guest_name, c.name AS category, x.amount_kobo, x.method, x.reason, x.source,
            s.full_name AS asked_by, x.requested_at, d.full_name AS decided_by, x.decided_at, x.decision_note, r.check_in, r.check_out
     FROM refund_requests x ${RES} LEFT JOIN staff_profiles s ON s.id = x.requested_by LEFT JOIN staff_profiles d ON d.id = x.decided_by
     -- A no-show that was undone (the guest turned up) drops out of the list.
     WHERE ${refundWhere} AND (x.source <> 'no_show' OR r.status = 'no_show' OR x.decided_at IS NOT NULL) ORDER BY coalesce(x.decided_at, x.requested_at) ${state === "waiting" ? "ASC" : "DESC"} LIMIT 200`,
  );
  const out: Approval[] = [];
  for (const x of refunds) {
    const limit = state === "waiting" ? await refundLimit(db, x.reservation_id) : null;
    const nights = Math.round((Date.parse(x.check_out) - Date.parse(x.check_in)) / 86_400_000);
    out.push({
      kind: x.source === "no_show" ? "no_show" : "refund", id: x.id, reservationId: x.reservation_id, reference: x.reference, guestName: x.guest_name, category: x.category,
      what: x.reason, askedBy: x.asked_by ?? "System", askedAt: x.requested_at, amountKobo: x.amount_kobo, method: x.method,
      decidedBy: x.decided_by, decidedAt: x.decided_at, note: x.decision_note,
      paidKobo: limit?.paid, usedKobo: limit?.used, nights,
      limitKobo: limit ? limit.limit + x.amount_kobo : undefined,
    });
  }

  const changeWhere = state === "waiting" ? "x.status = 'pending'" : state === "approved" ? "x.status = 'applied' AND x.payment_id IS NULL" : "x.status = 'cancelled'";
  const changes = await all<{ id: string; reservation_id: string; reference: string; guest_name: string; category: string; amount_kobo: number; description: string; asked_by: string | null; created_at: string; decided_by: string | null; decided_at: string | null; note: string | null }>(
    db,
    `SELECT x.id, x.reservation_id, r.reference, g.full_name AS guest_name, c.name AS category, x.amount_kobo, x.description, s.full_name AS asked_by, x.created_at,
            d.full_name AS decided_by, x.decided_at, x.note
     FROM reservation_changes x ${RES} LEFT JOIN staff_profiles s ON s.id = x.requested_by LEFT JOIN staff_profiles d ON d.id = x.decided_by
     WHERE ${changeWhere} ORDER BY coalesce(x.decided_at, x.created_at) DESC LIMIT 200`,
  );
  for (const x of changes) {
    out.push({
      kind: "unpaid_change", id: x.id, reservationId: x.reservation_id, reference: x.reference, guestName: x.guest_name, category: x.category,
      what: x.description, askedBy: x.asked_by ?? "Guest", askedAt: x.created_at, amountKobo: x.amount_kobo, decidedBy: x.decided_by, decidedAt: x.decided_at, note: x.note,
    });
  }

  const owingWhere = state === "waiting" ? "r.owing_decided_at IS NULL" : state === "approved" ? "r.owing_decision = 'agreed'" : "r.owing_decision = 'chase'";
  const owing = await all<{ id: string; reference: string; guest_name: string; category: string; due: number; paid: number; reason: string; asked_by: string | null; left_owing_at: string; decided_by: string | null; decided_at: string | null; note: string | null }>(
    db,
    `SELECT r.id, r.reference, g.full_name AS guest_name, c.name AS category, r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo AS due,
            (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0) FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful') AS paid,
            r.left_owing_reason AS reason, s.full_name AS asked_by, r.left_owing_at, d.full_name AS decided_by, r.owing_decided_at AS decided_at, r.owing_decision_note AS note
     FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id
     LEFT JOIN staff_profiles s ON s.id = r.left_owing_by LEFT JOIN staff_profiles d ON d.id = r.owing_decided_by
     WHERE r.left_owing_by IS NOT NULL AND ${owingWhere} ORDER BY coalesce(r.owing_decided_at, r.left_owing_at) DESC LIMIT 200`,
  );
  for (const x of owing) {
    out.push({
      kind: "leave_owing", id: x.id, reservationId: x.id, reference: x.reference, guestName: x.guest_name, category: x.category,
      what: `Left owing: ${x.reason}`, askedBy: x.asked_by ?? "Staff", askedAt: x.left_owing_at, amountKobo: Math.max(0, x.due - x.paid), decidedBy: x.decided_by, decidedAt: x.decided_at, note: x.note,
    });
  }
  return out.sort((a, b) => (state === "waiting" ? a.askedAt.localeCompare(b.askedAt) : (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")));
}

export async function waitingCount(db: Db): Promise<number> {
  const r = await first<{ n: number }>(
    db,
    `SELECT (SELECT count(*) FROM refund_requests x JOIN reservations r ON r.id = x.reservation_id WHERE x.decided_at IS NULL AND (x.source <> 'no_show' OR r.status = 'no_show')) + (SELECT count(*) FROM reservation_changes WHERE status = 'pending')
          + (SELECT count(*) FROM reservations WHERE left_owing_by IS NOT NULL AND owing_decided_at IS NULL) AS n`,
  );
  return r?.n ?? 0;
}

/**
 * Approve a refund: a `payments` row of kind refund for the amount (at most what was asked and at most what's
 * refundable: paid less the nights used). Paid by transfer it goes into Payments to confirm like any transfer.
 * Card bookings are refunded by transfer until Paystack refunds are built. Decline: kept, with the reason.
 */
export async function decideRefund(
  db: Db,
  actor: Actor,
  v: { id: string; approve: boolean; amountKobo?: number; method?: "bank_transfer" | "cash"; note: string },
): Promise<{ receiptNumber: string | null }> {
  needApprover(actor);
  const note = v.note?.trim() ?? "";
  if (note.length < 5) throw new AppError("VALIDATION", "Give a reason; it's shown in the history.", { fieldErrors: { note: ["A reason is required"] } });
  const x = await first<{ reservation_id: string; amount_kobo: number; method: "bank_transfer" | "cash"; requested_by: string; decided_at: string | null; reference: string; source: string }>(
    db,
    "SELECT x.reservation_id, x.amount_kobo, x.method, x.requested_by, x.decided_at, r.reference, x.source FROM refund_requests x JOIN reservations r ON r.id = x.reservation_id WHERE x.id = ?",
    v.id,
  );
  if (!x) throw new AppError("NOT_FOUND", "That request wasn't found.");
  if (x.decided_at) throw new AppError("CONFLICT", "Someone has already decided this. Reload the list.");
  if (x.requested_by === actor.id) throw new AppError("FORBIDDEN", "You asked for this refund, so another manager or the owner decides it.");
  if (x.source === "no_show" && !(await first(db, "SELECT 1 FROM reservations WHERE id = ? AND status = 'no_show'", x.reservation_id))) {
    throw new AppError("CONFLICT", "The no-show was undone: the guest arrived. Nothing to decide.");
  }

  if (!v.approve) {
    await writeBatch(db, actor, [
      db.prepare("UPDATE refund_requests SET decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), decision = 'declined', decision_note = ? WHERE id = ? AND decided_at IS NULL").bind(actor.id, note, v.id),
      activity(db, "refund.declined", "reservation", x.reservation_id, `Refund of ${formatNaira(x.amount_kobo)} declined: ${note}`, { refund_id: v.id }),
    ]);
    return { receiptNumber: null };
  }
  const amount = v.amountKobo ?? x.amount_kobo;
  const { limit } = await refundLimit(db, x.reservation_id);
  const max = Math.min(x.amount_kobo, limit + x.amount_kobo); // this request is counted as pending in the limit
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("VALIDATION", "Enter the amount to refund.", { fieldErrors: { amount: ["Enter an amount"] } });
  if (amount > max) {
    throw new AppError("VALIDATION", `At most ${formatNaira(max)} can be refunded: what was paid less the nights used.`, { fieldErrors: { amount: [`At most ${formatNaira(max)}`] } });
  }
  const method = v.method ?? x.method;
  const card = await first(db, "SELECT 1 FROM payments WHERE reservation_id = ? AND provider = 'paystack' AND status = 'successful' AND kind = 'payment'", x.reservation_id);
  const paymentId = uuid();
  try {
    await writeBatch(db, actor, [
      db
        .prepare(
          `INSERT INTO payments (id, reservation_id, kind, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by, notes)
           VALUES (?, ?, 'refund', ?, 'offline', ?, 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)`,
        )
        .bind(paymentId, x.reservation_id, amount, method, actor.id, `${x.source === "no_show" ? "No-show refund" : "Refund"}${card ? " by transfer (card booking)" : ""}: ${note}`.slice(0, 1000)),
      db
        .prepare("UPDATE refund_requests SET decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), decision = 'approved', decision_note = ?, payment_id = ? WHERE id = ? AND decided_at IS NULL")
        .bind(actor.id, note, paymentId, v.id),
      db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0"),
      activity(db, "refund.approved", "reservation", x.reservation_id, `Refund of ${formatNaira(amount)} approved for ${x.reference} (${method === "cash" ? "cash" : "transfer"}): ${note}`, { refund_id: v.id, payment_id: paymentId }),
    ]);
  } catch (err) {
    if (err instanceof Error && err.name === "StaleStateError") throw new AppError("CONFLICT", "Someone has already decided this. Reload the list.");
    throw err;
  }
  const r = await first<{ receipt_number: string | null }>(db, "SELECT receipt_number FROM payments WHERE id = ?", paymentId);
  return { receiptNumber: r?.receipt_number ?? null };
}

/** An unpaid change: approve applies it before payment (owed before check-out); decline cancels it. */
export async function decideChange(db: Db, actor: Actor, v: { id: string; approve: boolean; note: string }): Promise<void> {
  needApprover(actor);
  const note = v.note?.trim() ?? "";
  if (note.length < 5) throw new AppError("VALIDATION", "Give a reason; it's shown in the history.", { fieldErrors: { note: ["A reason is required"] } });
  if (v.approve) await applyChangeWithoutPayment(db, actor, v.id, note);
  else {
    await cancelChange(db, actor, v.id);
    await db.prepare("UPDATE reservation_changes SET note = ? WHERE id = ?").bind(note.slice(0, 500), v.id).run();
  }
}

/** Leave owing: agreed (it stays under Owed until paid) or to be chased (the desk follows it up). */
export async function decideOwing(db: Db, actor: Actor, v: { reservationId: string; approve: boolean; note: string }): Promise<void> {
  needApprover(actor);
  const note = v.note?.trim() ?? "";
  if (note.length < 5) throw new AppError("VALIDATION", "Give a reason; it's shown in the history.", { fieldErrors: { note: ["A reason is required"] } });
  const r = await first<{ left_owing_by: string | null; owing_decided_at: string | null; reference: string }>(db, "SELECT left_owing_by, owing_decided_at, reference FROM reservations WHERE id = ?", v.reservationId);
  if (!r?.left_owing_by) throw new AppError("NOT_FOUND", "That booking wasn't left owing.");
  if (r.owing_decided_at) throw new AppError("CONFLICT", "Someone has already decided this. Reload the list.");
  if (r.left_owing_by === actor.id) throw new AppError("FORBIDDEN", "You let this guest leave owing, so another manager or the owner decides it.");
  await writeBatch(db, actor, [
    db
      .prepare("UPDATE reservations SET owing_decided_by = ?, owing_decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), owing_decision = ?, owing_decision_note = ? WHERE id = ? AND owing_decided_at IS NULL")
      .bind(actor.id, v.approve ? "agreed" : "chase", note.slice(0, 500), v.reservationId),
    activity(db, v.approve ? "reservation.owing_agreed" : "reservation.owing_chase", "reservation", v.reservationId, `${r.reference}: leaving owing ${v.approve ? "agreed" : "not agreed; chase the payment"}. ${note}`),
  ]);
}
