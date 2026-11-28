// What a desk or till payment must carry, by method (FUNCTIONALITY.md section 2), the duplicate guard,
// the hotel's bank details and terminal list, and "declined but the guest was debited" (payment issues).

import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { activity, all, first, requireRole, uuid, writeBatch, type Actor, type Db } from "../db";

export type Method = "cash" | "bank_transfer" | "pos_terminal";
export type Details = { reference: string | null; senderName: string | null; slipLast4: string | null; terminal: string | null; seenInBankApp: boolean };
export type DetailsInput = {
  method: string; reference?: string | null; senderName?: string | null; slipLast4?: string | null; terminal?: string | null; seenInBankApp?: boolean;
};

export type PaymentSettings = { bank: { name: string | null; number: string | null; accountName: string | null }; terminals: string[] };

export async function paymentSettings(db: Db): Promise<PaymentSettings> {
  const r = await first<{ bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null; terminals: string }>(
    db,
    "SELECT bank_name, bank_account_number, bank_account_name, terminals FROM hotel_settings WHERE id = 1",
  );
  let terminals: string[] = [];
  try {
    terminals = (JSON.parse(r?.terminals ?? "[]") as unknown[]).filter((t): t is string => typeof t === "string");
  } catch {
    terminals = [];
  }
  return { bank: { name: r?.bank_name ?? null, number: r?.bank_account_number ?? null, accountName: r?.bank_account_name ?? null }, terminals };
}

const tidy = (s: string | null | undefined) => s?.trim().replace(/\s+/g, " ") || null;

/**
 * Cash: nothing else. Transfer: the reference or the sender's name (either), and the tick that the money was
 * seen in the hotel's own bank app. POS: exactly the last 4 digits of the slip, and a terminal from the list.
 */
export async function checkDetails(db: Db, v: DetailsInput): Promise<Details> {
  if (v.method === "cash") return { reference: null, senderName: null, slipLast4: null, terminal: null, seenInBankApp: false };
  if (v.method === "bank_transfer") {
    const reference = tidy(v.reference);
    const senderName = tidy(v.senderName);
    if ((reference?.length ?? 0) < 3 && (senderName?.length ?? 0) < 2) {
      throw new AppError("VALIDATION", "Enter the transfer reference or the sender's name, as the hotel's bank app shows it.", {
        fieldErrors: { reference: ["Enter the reference or the sender's name"] },
      });
    }
    if (reference && reference.length > 80) throw new AppError("VALIDATION", "That reference is too long.", { fieldErrors: { reference: ["Too long"] } });
    if (senderName && senderName.length > 80) throw new AppError("VALIDATION", "That name is too long.", { fieldErrors: { senderName: ["Too long"] } });
    if (v.seenInBankApp !== true) {
      throw new AppError("VALIDATION", "Check the hotel's bank app first and tick the box. A screenshot or SMS on the customer's phone is not enough.", {
        fieldErrors: { seenInBankApp: ["Tick once you've seen it in the hotel's bank app"] },
      });
    }
    return { reference: reference && reference.length >= 3 ? reference : null, senderName, slipLast4: null, terminal: null, seenInBankApp: true };
  }
  if (v.method === "pos_terminal") {
    const slip = v.slipLast4?.trim() ?? "";
    if (!/^\d{4}$/.test(slip)) {
      throw new AppError("VALIDATION", "Enter exactly the last 4 digits of the POS slip, once the terminal prints APPROVED.", { fieldErrors: { slipLast4: ["Enter 4 digits"] } });
    }
    const { terminals } = await paymentSettings(db);
    const terminal = tidy(v.terminal);
    if (!terminal || !terminals.includes(terminal)) throw new AppError("VALIDATION", "Choose the terminal it was paid on.", { fieldErrors: { terminal: ["Choose the terminal"] } });
    return { reference: null, senderName: null, slipLast4: slip, terminal, seenInBankApp: false };
  }
  throw new AppError("VALIDATION", "Choose how it was paid: cash, transfer or POS.", { fieldErrors: { method: ["Choose one"] } });
}

/**
 * Duplicate guard: a warning, not a block. The same transfer reference, or the same slip digits with the same
 * amount, recorded in the last 7 days at the desk or the till.
 */
export async function duplicateWarning(db: Db, method: string, d: Details, amountKobo: number): Promise<string | null> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  if (method === "bank_transfer" && d.reference) {
    const hit = await first<{ at: string; amount: number }>(
      db,
      `SELECT paid_at AS at, amount_kobo AS amount FROM payments WHERE provider = 'offline' AND lower(provider_reference) = lower(?1) AND paid_at > ?2
       UNION ALL SELECT paid_at, total_kobo FROM pos_orders WHERE lower(payment_reference) = lower(?1) AND paid_at > ?2 AND status = 'paid'
       ORDER BY 1 DESC LIMIT 1`,
      d.reference,
      since,
    );
    if (hit) return `Transfer reference ${d.reference} was already recorded (${formatNaira(hit.amount)}) in the last 7 days. Check it isn't the same transfer.`;
  }
  if (method === "pos_terminal" && d.slipLast4) {
    const hit = await first<{ at: string }>(
      db,
      `SELECT paid_at AS at FROM payments WHERE slip_last4 = ?1 AND amount_kobo = ?2 AND paid_at > ?3
       UNION ALL SELECT paid_at FROM pos_orders WHERE slip_last4 = ?1 AND total_kobo = ?2 AND paid_at > ?3 AND status = 'paid'
       LIMIT 1`,
      d.slipLast4,
      amountKobo,
      since,
    );
    if (hit) return `A POS slip ending ${d.slipLast4} for ${formatNaira(amountKobo)} was already recorded in the last 7 days. Check it isn't the same payment.`;
  }
  return null;
}

/** Thrown when a duplicate is found and the person hasn't said to record it anyway. The screen offers "Record anyway". */
export function duplicateError(message: string): AppError {
  return new AppError("CONFLICT", message, { fieldErrors: { duplicate: [message] } });
}

// ---------------------------------------------------------------------------
// Declined but the guest was debited
// ---------------------------------------------------------------------------

export type IssueSource = "reservation" | "pos_order";

/** Records no payment. Creates an issue that the GM and owner check with the bank. */
export async function reportPaymentIssue(
  db: Db,
  actor: Actor,
  v: { sourceType: IssueSource; sourceId: string; amountKobo: number; terminal?: string | null; slipLast4?: string | null; note?: string | null },
): Promise<string> {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  const allowed = v.sourceType === "reservation" ? can(actor.role, "payments.record") : can(actor.role, "pos.sell");
  if (!allowed) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  if (!Number.isInteger(v.amountKobo) || v.amountKobo <= 0) throw new AppError("VALIDATION", "Enter the amount the customer was debited.");
  const slip = v.slipLast4?.trim() || null;
  if (slip && !/^\d{4}$/.test(slip)) throw new AppError("VALIDATION", "The slip number is the last 4 digits.", { fieldErrors: { slipLast4: ["4 digits"] } });
  const exists =
    v.sourceType === "reservation"
      ? await first<{ label: string }>(db, "SELECT reference AS label FROM reservations WHERE id = ?", v.sourceId)
      : await first<{ label: string }>(db, "SELECT '#' || number AS label FROM pos_orders WHERE id = ?", v.sourceId);
  if (!exists) throw new AppError("NOT_FOUND", "That booking or order wasn't found.");
  const id = uuid();
  await writeBatch(db, actor, [
    db
      .prepare("INSERT INTO payment_issues (id, source_type, source_id, amount_kobo, terminal, slip_last4, note, reported_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, v.sourceType, v.sourceId, v.amountKobo, v.terminal?.trim() || null, slip, v.note?.trim().slice(0, 500) || null, actor.id),
    activity(db, "payment.issue_reported", v.sourceType === "reservation" ? "reservation" : "pos_order", v.sourceId, `Card declined but customer debited ${formatNaira(v.amountKobo)} (${exists.label}). Nothing recorded; check with the bank.`, { issue_id: id }),
  ]);
  return id;
}

export type OpenIssue = {
  id: string; source_type: IssueSource; source_id: string; label: string; amount_kobo: number; terminal: string | null; slip_last4: string | null;
  note: string | null; reported_by_name: string | null; reported_by: string; reported_at: string;
};

export async function openPaymentIssues(db: Db, actor: Actor): Promise<OpenIssue[]> {
  requireRole(actor, ["owner", "general_manager", "finance"]);
  return all<OpenIssue>(
    db,
    `SELECT i.id, i.source_type, i.source_id, i.amount_kobo, i.terminal, i.slip_last4, i.note, i.reported_by, i.reported_at, s.full_name AS reported_by_name,
            CASE i.source_type WHEN 'reservation' THEN (SELECT g.full_name || ' · ' || r.reference FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE r.id = i.source_id)
              ELSE (SELECT (CASE o.outlet WHEN 'bar' THEN 'Bar' ELSE 'Restaurant' END) || ' · order #' || o.number || coalesce(' · ' || o.note, '') FROM pos_orders o WHERE o.id = i.source_id) END AS label
     FROM payment_issues i LEFT JOIN staff_profiles s ON s.id = i.reported_by
     WHERE i.resolved_at IS NULL ORDER BY i.reported_at`,
  );
}

/**
 * The GM or owner closes an issue after checking with the bank. "Money arrived" needs the payment recorded for it
 * (the booking's or order's payment id); the other outcomes need a note.
 */
export async function resolvePaymentIssue(
  db: Db,
  actor: Actor,
  v: { id: string; outcome: "money_arrived" | "not_debited" | "refunded_by_bank"; note?: string | null; receipt?: string | null },
): Promise<void> {
  requireRole(actor, ["owner", "general_manager"]);
  const issue = await first<{ reported_by: string; resolved_at: string | null; source_type: IssueSource; source_id: string }>(
    db,
    "SELECT reported_by, resolved_at, source_type, source_id FROM payment_issues WHERE id = ?",
    v.id,
  );
  if (!issue) throw new AppError("NOT_FOUND", "That issue wasn't found.");
  if (issue.resolved_at) throw new AppError("CONFLICT", "Someone has already closed this. Reload the list.");
  if (issue.reported_by === actor.id) throw new AppError("FORBIDDEN", "You reported this one. Another manager or the owner checks it.");
  const note = v.note?.trim() || null;
  let paymentId: string | null = null;
  if (v.outcome === "money_arrived") {
    const receipt = v.receipt?.trim().toUpperCase() ?? "";
    const paid =
      issue.source_type === "reservation"
        ? await first<{ id: string }>(db, "SELECT id FROM payments WHERE receipt_number = ? AND reservation_id = ? AND status = 'successful' AND kind = 'payment'", receipt, issue.source_id)
        : await first<{ id: string }>(db, "SELECT id FROM pos_orders WHERE receipt_number = ? AND id = ? AND status = 'paid'", receipt, issue.source_id);
    if (!paid) throw new AppError("VALIDATION", "Record the payment on the booking or order first, then enter its receipt number here.", { fieldErrors: { receipt: ["Receipt not found for this booking or order"] } });
    paymentId = paid.id;
  } else if (!note || note.length < 5) {
    throw new AppError("VALIDATION", "Say what the bank told you (e.g. 'Moniepoint: reversed 27 Nov').", { fieldErrors: { note: ["Say what the bank said"] } });
  }
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE payment_issues SET resolved_by = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), outcome = ?, resolution_note = ?, payment_id = ? WHERE id = ? AND resolved_at IS NULL")
      .bind(actor.id, v.outcome, note, paymentId, v.id),
    activity(db, "payment.issue_closed", "payment_issue", v.id, `Declined-but-debited checked: ${v.outcome.replace(/_/g, " ")}${note ? `. ${note}` : ""}`),
  ]);
  if (!r?.meta.changes) throw new AppError("CONFLICT", "Someone has already closed this. Reload the list.");
}

/** The owner, GM or hotel manager sets the bank details and the list of POS terminals (settings.manage). */
export async function updatePaymentSettings(
  db: Db,
  actor: Actor,
  v: { bankName: string | null; bankAccountNumber: string | null; bankAccountName: string | null; terminals: string[] },
): Promise<void> {
  if (!actor || !can(actor.role, "settings.manage")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  const number = v.bankAccountNumber?.replace(/\s/g, "") || null;
  if (number && !/^\d{10}$/.test(number)) throw new AppError("VALIDATION", "A NUBAN account number is 10 digits.", { fieldErrors: { bankAccountNumber: ["10 digits"] } });
  const terminals = [...new Set(v.terminals.map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => t.length >= 2 && t.length <= 40))];
  if (!terminals.length) throw new AppError("VALIDATION", "List at least one POS terminal.", { fieldErrors: { terminals: ["At least one"] } });
  if (terminals.length > 10) throw new AppError("VALIDATION", "At most 10 terminals.", { fieldErrors: { terminals: ["At most 10"] } });
  await writeBatch(db, actor, [
    db
      .prepare("UPDATE hotel_settings SET bank_name = ?, bank_account_number = ?, bank_account_name = ?, terminals = ? WHERE id = 1")
      .bind(v.bankName?.trim() || null, number, v.bankAccountName?.trim() || null, JSON.stringify(terminals)),
    activity(db, "settings.payment_details", "hotel_settings", "1", `Payment details updated: ${v.bankName?.trim() || "no bank"} · ${terminals.length} terminal${terminals.length === 1 ? "" : "s"}`),
  ]);
}
