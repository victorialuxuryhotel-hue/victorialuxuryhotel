// Payments to confirm (interface brief I1). Every successful transfer and POS/card payment taken by
// staff (front desk, hall, restaurant & bar) is ticked off by the General Manager or Owner against
// the bank statement or the card terminal's report. Paystack payments are verified already; cash is
// covered by closings. One check per payment, append-only (migration 0021).

import { AppError } from "@/lib/errors";
import { alert } from "@/lib/alert";
import { formatNaira } from "@/lib/format";
import { dbErrorToken } from "../db-errors";
import { activity, all, first, MONEY_APPROVERS, requireRole, uuid, writeBatch, type Actor, type Db, type Stmt } from "../db";

export type CheckSource = "payment" | "hall_payment" | "pos_order";
export type ToConfirm = {
  source_type: CheckSource; source_id: string; at: string; taken_by: string | null; who: string;
  method: "bank_transfer" | "pos_terminal"; amount_kobo: number; reference: string | null; reservation_id: string | null;
};

const READERS = [...MONEY_APPROVERS, "finance"] as const;

/** The non-cash payments nobody has checked yet, oldest first. */
const UNCHECKED_SQL = `
  SELECT 'payment' AS source_type, p.id AS source_id, p.paid_at AS at, s.full_name AS taken_by,
         g.full_name || ' · ' || r.reference AS who, p.method, p.amount_kobo, p.provider_reference AS reference, r.id AS reservation_id
  FROM payments p JOIN reservations r ON r.id = p.reservation_id JOIN guests g ON g.id = r.guest_id LEFT JOIN staff_profiles s ON s.id = p.recorded_by
  WHERE p.status = 'successful' AND p.kind = 'payment' AND p.provider = 'offline' AND p.method IN ('bank_transfer', 'pos_terminal')
    AND NOT EXISTS (SELECT 1 FROM payment_checks c WHERE c.source_type = 'payment' AND c.source_id = p.id)
  UNION ALL
  SELECT 'hall_payment', hp.id, hp.created_at, s.full_name, 'Hall · ' || h.title || ' · ' || h.customer_name, hp.method, hp.amount_kobo, hp.reference, NULL
  FROM hall_payments hp JOIN hall_bookings h ON h.id = hp.booking_id LEFT JOIN staff_profiles s ON s.id = hp.recorded_by
  WHERE hp.method IN ('bank_transfer', 'pos_terminal')
    AND NOT EXISTS (SELECT 1 FROM payment_checks c WHERE c.source_type = 'hall_payment' AND c.source_id = hp.id)
  UNION ALL
  SELECT 'pos_order', o.id, o.paid_at, s.full_name,
         (CASE o.outlet WHEN 'bar' THEN 'Bar' ELSE 'Restaurant' END) || ' · ' || o.receipt_number || coalesce(' · ' || o.note, ''),
         o.method, o.total_kobo, o.payment_reference, NULL
  FROM pos_orders o LEFT JOIN staff_profiles s ON s.id = o.paid_by
  WHERE o.status = 'paid' AND o.method IN ('bank_transfer', 'pos_terminal')
    AND NOT EXISTS (SELECT 1 FROM payment_checks c WHERE c.source_type = 'pos_order' AND c.source_id = o.id)`;

export async function paymentsToConfirm(db: Db, actor: Actor, limit = 500): Promise<ToConfirm[]> {
  requireRole(actor, READERS);
  return all<ToConfirm>(db, `SELECT * FROM (${UNCHECKED_SQL}) ORDER BY at, source_id LIMIT ?`, limit);
}

/** Count and total for the Dashboard: always the same rows as the list. */
export async function toConfirmSummary(db: Db, actor: Actor): Promise<{ count: number; kobo: number }> {
  requireRole(actor, READERS);
  const r = await first<{ count: number; kobo: number }>(db, `SELECT count(*) AS count, coalesce(sum(amount_kobo), 0) AS kobo FROM (${UNCHECKED_SQL})`);
  return { count: r?.count ?? 0, kobo: r?.kobo ?? 0 };
}

const METHOD = { bank_transfer: "transfer", pos_terminal: "POS payment" } as const;

/**
 * The General Manager or Owner records what the statement or terminal report shows. "Not found"
 * needs a note, raises an alert, and (for a booking) flags it so the payment is corrected through
 * the usual correction. The payment itself is never changed here.
 */
export async function checkPayment(
  db: Db,
  actor: Actor,
  v: { sourceType: CheckSource; sourceId: string; outcome: "matched" | "not_found"; note?: string | null },
): Promise<void> {
  requireRole(actor, MONEY_APPROVERS);
  const note = v.note?.trim() || null;
  if (v.outcome === "not_found" && (!note || note.length < 5)) {
    throw new AppError("VALIDATION", "Say what you checked (e.g. 'Not on the GTB statement for 24–25 Nov'). It goes with the alert.", { fieldErrors: { note: ["Say what you checked"] } });
  }
  const item = await first<ToConfirm>(db, `SELECT * FROM (${UNCHECKED_SQL}) WHERE source_type = ? AND source_id = ?`, v.sourceType, v.sourceId);
  if (!item) {
    const done = await first(db, "SELECT 1 FROM payment_checks WHERE source_type = ? AND source_id = ?", v.sourceType, v.sourceId);
    throw new AppError(done ? "CONFLICT" : "NOT_FOUND", done ? "Someone has already checked this payment. Reload the list." : "That payment isn't one to confirm. Reload the list.");
  }
  const what = `${METHOD[item.method]} of ${formatNaira(item.amount_kobo)} (${item.who}${item.reference ? `, ref ${item.reference}` : ""})`;
  const stmts: Stmt[] = [
    db
      .prepare("INSERT INTO payment_checks (id, source_type, source_id, outcome, note, checked_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(uuid(), v.sourceType, v.sourceId, v.outcome, note, actor!.id),
    activity(db, v.outcome === "matched" ? "payment.confirmed" : "payment.not_found", v.sourceType, v.sourceId, `${v.outcome === "matched" ? "Confirmed" : "Not found"}: ${what}${note ? `. ${note}` : ""}`, {
      outcome: v.outcome,
      amount_kobo: item.amount_kobo,
    }),
  ];
  if (v.outcome === "not_found" && item.reservation_id) {
    stmts.push(
      db
        .prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?")
        .bind(`A ${METHOD[item.method]} of ${formatNaira(item.amount_kobo)} wasn't found on the statement. Correct the payment, then mark this resolved. (${note})`, item.reservation_id),
    );
  }
  try {
    await writeBatch(db, actor, stmts);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "unique") throw new AppError("CONFLICT", "Someone has already checked this payment. Reload the list.");
    throw err;
  }
  if (v.outcome === "not_found") await alert("payment_not_found", `A ${what} wasn't found on the statement`, { note, taken_by: item.taken_by });
}
