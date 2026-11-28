import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { addDays, hotelInstant, hotelTimeNow, hotelToday } from "@/lib/hotel-date";
import { dbErrorToken, StaleStateError } from "../db-errors";
import {
  assertNetPaid,
  activity,
  all,
  ALL_STAFF,
  assertVersion,
  first,
  MONEY_APPROVERS,
  now,
  requireRole,
  retryOnStale,
  uuid,
  writeBatch,
  type Actor,
  type Db,
  type Stmt,
} from "../db";
import { applyChangeStatements, pendingChange, rethrowChangeError } from "./changes";
import { autoAssignRoomStatements, freeUnits } from "./inventory";
import { checkDetails, duplicateError, duplicateWarning } from "./payment-details";
import { dueOf, loadReservation, netPaid, RES_COLUMNS, type ReservationRow } from "./reservations";

/** Marker on a Paystack payment whose amount or currency didn't match: it waits for a person (alerted once). */
export const MISMATCH_FLAG = "Amount/currency mismatch";

/**
 * Pending Paystack payments the scheduled job should ask Paystack about: 30 minutes to 48 hours old,
 * oldest first. Payments already flagged for a mismatch are left for a person, so they never take
 * the batch's places and starve newer payments.
 */
export async function paymentsToSweep(db: Db, now = Date.now(), limit = 50): Promise<string[]> {
  // A company bill paid online is one Paystack charge (the link's reference) split into a payment per booking
  // (that reference + "-1", "-2"…): ask Paystack about the charge, once.
  const rows = await all<{ provider_reference: string }>(
    db,
    `SELECT DISTINCT coalesce((SELECT l.paystack_reference FROM pay_links l WHERE l.paystack_reference IS NOT NULL AND p.provider_reference LIKE l.paystack_reference || '-%'), p.provider_reference) AS provider_reference
     FROM payments p
     WHERE p.provider = 'paystack' AND p.status = 'pending' AND p.created_at >= ? AND p.created_at <= ?
       AND coalesce(p.gateway_response, '') NOT LIKE '${MISMATCH_FLAG}%'
     ORDER BY p.created_at LIMIT ?`,
    new Date(now - 48 * 3600_000).toISOString(),
    new Date(now - 30 * 60_000).toISOString(),
    limit,
  );
  return rows.map((r) => r.provider_reference);
}

export type SettleOutcome =
  | "confirmed" | "part_paid" | "paid_unavailable" | "paid_closed" | "already_settled" | "already_processed"
  | "amount_mismatch" | "already_flagged" | "overpaid" | "failed" | "abandoned" | "still_pending";

type PaymentRow = {
  id: string;
  reservation_id: string;
  amount_kobo: number;
  status: "pending" | "successful" | "failed" | "abandoned";
  gateway_response: string | null;
  version: number;
};

const naira = (kobo: number) => formatNaira(kobo).replace(/\s/g, "");

function retryIfCapacityRace(err: unknown): never {
  if (err instanceof AppError && dbErrorToken(err.cause) === "no_capacity") throw new StaleStateError(err);
  throw err;
}


/**
 * What a payment does to the booking. `partConfirms` (desk payments): any payment confirms an unpaid booking,
 * so a deposit ends the hold and the room isn't released with money taken; the balance shows as owed and
 * check-in still needs it paid or a manager's override. Online payments confirm only when paid in full.
 */
async function settleStatements(db: Db, res: ReservationRow, paidAfter: number, dueAfter = dueOf(res), partConfirms = false): Promise<{ outcome: SettleOutcome; stmts: Stmt[]; reason?: string }> {
  const stmts: Stmt[] = [];
  let outcome: SettleOutcome;
  let reason: string | undefined;
  const confirm = () =>
    stmts.push(
      db.prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ?").bind(res.id),
      ...(res.room_id ? [] : autoAssignRoomStatements(db, res.id)),
    );
  const flag = (text: string) => stmts.push(db.prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?").bind(text, res.id));

  if (paidAfter < dueAfter && !(partConfirms && (res.status === "pending_payment" || res.status === "expired"))) {
    outcome = "part_paid";
  } else if (res.status === "pending_payment" && res.hold_expires_at && res.hold_expires_at > now()) {
    confirm();
    outcome = "confirmed";
  } else if (res.status === "pending_payment" || res.status === "expired") {
    if ((await freeUnits(db, res.category_id, res.check_in, res.check_out, res.id)) > 0) {
      confirm();
      outcome = "confirmed";
    } else {
      if (res.status === "pending_payment") {
        reason = "Paid after hold expired; no room available";
        stmts.push(db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").bind(res.id));
      }
      flag("Paid in full after the hold expired, but this room type is now fully booked. Offer another room or arrange a refund.");
      outcome = "paid_unavailable";
    }
  } else if (res.status === "cancelled" || res.status === "no_show") {
    flag("Payment received for a cancelled booking. Arrange a refund or rebook.");
    outcome = "paid_closed";
  } else {
    outcome = "already_settled"; // confirmed / checked in / checked out
  }

  const over = paidAfter - dueAfter;
  if (over > 0) {
    flag(`Overpaid by ${naira(over)}: more than one payment was received. Refund the difference.`);
    stmts.push(activity(db, "payment.overpaid", "reservation", res.id, `${res.reference} overpaid by ${naira(over)}`, { over_kobo: over }));
    outcome = "overpaid";
  }
  return { outcome, stmts, reason };
}

export async function beginPaystackPayment(db: Db, publicToken: string): Promise<{ reference: string; amountKobo: number; email: string; reservationReference: string }> {
  return retryOnStale(async () => {
    const res = await first<ReservationRow>(
      db,
      `SELECT ${RES_COLUMNS} FROM reservations WHERE public_token = ?`,
      publicToken,
    );
    if (!res) throw new AppError("NOT_FOUND", "Booking not found.");
    // Unpaid bookings within their hold, and part-paid ones (a deposit at the desk, then a payment link: section 10).
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw new AppError("INVALID_TRANSITION", "This booking can no longer be paid online.");
    if (res.status === "pending_payment" && (!res.hold_expires_at || res.hold_expires_at <= now())) throw new AppError("UNAVAILABLE", "Your booking hold has ended. Please search again.");
    const guest = await first<{ email: string | null }>(db, "SELECT email FROM guests WHERE id = ?", res.guest_id);
    if (!guest?.email) throw new AppError("VALIDATION", "An email address is needed to pay online.");
    const paid = await netPaid(db, res.id);
    const balance = dueOf(res) - paid;
    if (balance <= 0) throw new AppError("INVALID_TRANSITION", res.status === "pending_payment" ? "Nothing left to pay on this booking." : "This booking is already paid and confirmed.");

    const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
    const reference = `${res.reference.toLowerCase()}-${hex}`;
    await writeBatch(db, null, [
      assertVersion(db, "reservations", res.id, res.version),
      assertNetPaid(db, res.id, paid),
      db
        .prepare("INSERT INTO payments (id, reservation_id, amount_kobo, provider, provider_reference, status) VALUES (?, ?, ?, 'paystack', ?, 'pending')")
        .bind(uuid(), res.id, balance, reference),
      activity(db, "payment.started", "reservation", res.id, `Online payment started for ${res.reference}`, { provider_reference: reference, amount_kobo: balance }),
    ]);
    return { reference, amountKobo: balance, email: guest.email, reservationReference: res.reference };
  });
}

const methodFor = (channel: string | null) =>
  channel === "card" ? "card" : channel === "bank" || channel === "bank_transfer" ? "bank_transfer" : channel === "ussd" ? "ussd" : "other";

export async function applyPaystackResult(
  db: Db,
  r: { reference: string; status: string; amountKobo: number; currency: string; paidAt: string | null; channel: string | null; gatewayResponse: string | null },
): Promise<SettleOutcome> {
  return retryOnStale(async () => {
    const pay = await first<PaymentRow>(
      db,
      "SELECT id, reservation_id, amount_kobo, status, gateway_response, version FROM payments WHERE provider = 'paystack' AND provider_reference = ?",
      r.reference,
    );
    if (!pay) throw new AppError("NOT_FOUND", "We couldn't find that payment. If money has left your account, contact the hotel with your bank reference.");
    if (pay.status === "successful") return "already_processed";
    const res = await loadReservation(db, pay.reservation_id);
    const guard = [assertVersion(db, "payments", pay.id, pay.version), assertVersion(db, "reservations", res.id, res.version)];

    if (r.status === "success") {
      if (r.currency.toUpperCase() !== "NGN" || r.amountKobo !== pay.amount_kobo) {
        if (pay.gateway_response?.startsWith(MISMATCH_FLAG)) return "already_flagged";
        await writeBatch(db, null, [
          ...guard,
          db
            .prepare("UPDATE payments SET gateway_response = ? WHERE id = ?")
            .bind(`${MISMATCH_FLAG}: expected ${pay.amount_kobo} NGN, Paystack reported ${r.amountKobo} ${r.currency}`, pay.id),
          db
            .prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?")
            .bind("Paystack reported a payment that does not match the amount owed. Check the Paystack dashboard before confirming.", res.id),
          activity(db, "payment.mismatch", "reservation", res.id, `Payment ${r.reference} for ${res.reference} did not match the amount due`, {
            expected_kobo: pay.amount_kobo,
            reported_kobo: r.amountKobo,
            currency: r.currency,
          }),
        ]);
        return "amount_mismatch";
      }

      const paid = await netPaid(db, res.id);
      const settle = await settleStatements(db, res, paid + pay.amount_kobo);
      await writeBatch(
        db,
        null,
        [
          ...guard,
          assertNetPaid(db, res.id, paid),
          db
            .prepare(
              `UPDATE payments SET status = 'successful', paid_at = ?, verified_at = ?, provider_channel = ?, method = ?, gateway_response = ?
               WHERE id = ?`,
            )
            .bind(r.paidAt ?? now(), now(), r.channel || null, methodFor(r.channel), r.gatewayResponse || null, pay.id),
          ...settle.stmts,
          activity(db, "payment.verified", "reservation", res.id, `Paystack payment verified for ${res.reference} (${naira(pay.amount_kobo)})`, {
            provider_reference: r.reference,
            outcome: settle.outcome,
            channel: r.channel,
          }),
        ],
        settle.reason,
      ).catch(retryIfCapacityRace);
      return settle.outcome;
    }

    if (pay.status !== "pending") return "already_processed";
    if (r.status === "failed" || r.status === "reversed") {
      await writeBatch(db, null, [
        ...guard,
        db.prepare("UPDATE payments SET status = 'failed', gateway_response = ? WHERE id = ?").bind(r.gatewayResponse || null, pay.id),
        activity(db, "payment.failed", "reservation", res.id, `Online payment failed for ${res.reference}`, {
          provider_reference: r.reference,
          gateway_response: r.gatewayResponse,
        }),
      ]);
      return "failed";
    }
    if (r.status === "abandoned") {
      await writeBatch(db, null, [...guard, db.prepare("UPDATE payments SET status = 'abandoned', gateway_response = ? WHERE id = ?").bind(r.gatewayResponse || null, pay.id)]);
      return "abandoned";
    }
    return "still_pending"; // ongoing / pending / queued: nothing to do yet
  });
}

export async function recordOfflinePayment(
  db: Db,
  actor: Actor,
  input: {
    reservationId: string;
    paymentId?: string;
    amountKobo: number;
    method: "cash" | "bank_transfer" | "pos_terminal";
    /** Transfer: the reference and/or the sender's name. */
    reference?: string | null;
    senderName?: string | null;
    /** POS: exactly the last 4 digits of the slip, and the terminal (from settings). */
    slipLast4?: string | null;
    terminal?: string | null;
    paidOn: string;
    notes?: string | null;
    /** The money is in hand, or (transfer) was seen in the hotel's own bank app. */
    confirmReceived: boolean;
    /** Record even though the same reference or slip was used in the last 7 days. */
    duplicateOk?: boolean;
  },
): Promise<{ paymentId: string; receiptNumber: string; outcome: SettleOutcome }> {
  requireRole(actor, ALL_STAFF);
  if (input.confirmReceived !== true) throw new AppError("VALIDATION", "Confirm that the hotel has received this money before recording it.");
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) throw new AppError("VALIDATION", "Enter the amount received.");
  // Every non-cash payment can be checked: transfers against the bank statement, POS slips against the terminal (section 2).
  const details = await checkDetails(db, { ...input, seenInBankApp: input.confirmReceived });
  const today = hotelToday();
  if (!input.paidOn || input.paidOn > today) throw new AppError("VALIDATION", "The payment date can't be in the future.");
  if (input.paidOn < addDays(today, -60)) throw new AppError("VALIDATION", "Payments older than 60 days must be recorded by a manager with the accounts team.");

  const already = async () => {
    if (!input.paymentId) return null;
    const row = await first<{ reservation_id: string; receipt_number: string }>(db, "SELECT reservation_id, receipt_number FROM payments WHERE id = ?", input.paymentId);
    if (row && row.reservation_id !== input.reservationId) throw new AppError("CONFLICT", "This form was already used. Reload and try again.");
    return row ? { paymentId: input.paymentId, receiptNumber: row.receipt_number, outcome: "already_processed" as const } : null;
  };

  return retryOnStale(async () => {
    const done = await already();
    if (done) return done;
    const res = await loadReservation(db, input.reservationId);
    if (!["pending_payment", "confirmed", "checked_in", "checked_out", "expired"].includes(res.status)) {
      throw new AppError("INVALID_TRANSITION", "Payments can't be taken against a cancelled booking.");
    }
    const paid = await netPaid(db, res.id);
    // A change waiting for payment (upgrade, move, extra nights) is paid with everything else owed, and applied in the same step.
    const change = await pendingChange(db, res.id);
    const dueAfter = dueOf(res) + (change?.amount_kobo ?? 0);
    const balance = dueAfter - paid;
    if (balance <= 0) throw new AppError("VALIDATION", "This booking is already paid in full.");
    // Part payments are allowed; overpaying isn't (for cash, record what's owed and give change).
    if (input.amountKobo > balance) {
      throw new AppError("VALIDATION", input.method === "cash" ? `Only ${naira(balance)} is owed. Record ${naira(balance)} and give the change.` : `Only ${naira(balance)} is owed. Take no more than that.`, {
        fieldErrors: { amount: [`At most ${naira(balance)}`] },
      });
    }
    // A change waiting for payment (upgrade, move, extra nights) is applied with the payment, so it's paid in one go.
    if (change && input.amountKobo !== balance) throw new AppError("VALIDATION", `This includes a change waiting for payment. Take the full ${naira(balance)} owed.`, { fieldErrors: { amount: [`Take ${naira(balance)}`] } });
    if (!input.duplicateOk) {
      const dup = await duplicateWarning(db, input.method, details, input.amountKobo);
      if (dup) throw duplicateError(dup);
    }

    const paymentId = input.paymentId ?? uuid();
    const settle = await settleStatements(db, res, paid + input.amountKobo, dueAfter, true);
    const changeStmts = change ? await applyChangeStatements(db, res, change, { paymentId, decidedBy: actor!.id, paidAfterKobo: paid + input.amountKobo }) : [];
    const methodLabel = input.method.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    try {
      await writeBatch(
        db,
        actor,
        [
          assertVersion(db, "reservations", res.id, res.version),
          assertNetPaid(db, res.id, paid),
          db
            .prepare(
              `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, sender_name, slip_last4, terminal, seen_in_bank_app,
                 status, paid_at, verified_at, recorded_by, notes)
               VALUES (?, ?, ?, 'offline', ?, ?, ?, ?, ?, ?, 'successful', ?, ?, ?, ?)`,
            )
            .bind(
              paymentId, res.id, input.amountKobo, input.method, details.reference, details.senderName, details.slipLast4, details.terminal, details.seenInBankApp ? 1 : 0,
              hotelInstant(input.paidOn, hotelTimeNow()), now(), actor.id, input.notes?.trim() || null,
            ),
          ...changeStmts,
          ...settle.stmts,
          activity(db, "payment.recorded", "reservation", res.id, `${methodLabel} payment of ${naira(input.amountKobo)} recorded for ${res.reference}`, {
            payment_id: paymentId,
            outcome: settle.outcome,
          }),
        ],
        settle.reason,
      );
    } catch (err) {
      if (err instanceof AppError && dbErrorToken(err.cause) === "unique") {
        const done = await already();
        if (done) return done;
        throw new AppError("CONFLICT", "A payment with this reference has already been recorded.");
      }
      if (change && err instanceof AppError && ["room_overlap", "no_capacity"].includes(dbErrorToken(err.cause) ?? "")) rethrowChangeError(err, change);
      retryIfCapacityRace(err);
    }
    const row = await first<{ receipt_number: string }>(db, "SELECT receipt_number FROM payments WHERE id = ?", paymentId);
    return { paymentId, receiptNumber: row!.receipt_number, outcome: settle.outcome };
  });
}

export async function recordPaymentCorrection(
  db: Db,
  actor: Actor,
  input: { paymentId: string; amountKobo: number; reason: string },
): Promise<{ receiptNumber: string; balanceKobo: number }> {
  requireRole(actor, MONEY_APPROVERS);
  const why = (input.reason ?? "").trim();
  if (why.length < 5) throw new AppError("VALIDATION", "Say what was wrong (it is kept with the payment).");
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) throw new AppError("VALIDATION", "Enter the amount to correct.");

  return retryOnStale(async () => {
    const original = await first<{ id: string; reservation_id: string; amount_kobo: number; kind: string; status: string; method: string | null; receipt_number: string | null }>(
      db,
      "SELECT id, reservation_id, amount_kobo, kind, status, method, receipt_number FROM payments WHERE id = ?",
      input.paymentId,
    );
    if (!original || original.kind !== "payment" || original.status !== "successful") throw new AppError("NOT_FOUND", "Only a successful payment can be corrected.");
    const corrected = await first<{ total: number }>(
      db,
      "SELECT coalesce(sum(amount_kobo), 0) AS total FROM payments WHERE corrects_payment_id = ? AND status = 'successful'",
      original.id,
    );
    const left = original.amount_kobo - (corrected?.total ?? 0);
    if (input.amountKobo > left) throw new AppError("VALIDATION", `At most ${naira(left)} of this payment can still be corrected.`);

    const res = await loadReservation(db, original.reservation_id);
    const paid = await netPaid(db, res.id);
    const balance = dueOf(res) - (paid - input.amountKobo);
    const id = uuid();
    const stmts: Stmt[] = [
      assertVersion(db, "reservations", res.id, res.version),
      assertNetPaid(db, res.id, paid),
      db
        .prepare(
          `INSERT INTO payments (id, reservation_id, kind, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by, notes, corrects_payment_id)
           VALUES (?, ?, 'refund', ?, 'offline', ?, 'successful', ?, ?, ?, ?, ?)`,
        )
        .bind(id, res.id, input.amountKobo, original.method ?? "other", now(), now(), actor.id, why, original.id),
    ];
    if (balance > 0 && (res.status === "confirmed" || res.status === "checked_in")) {
      stmts.push(
        db.prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?").bind(`A payment was corrected: ${naira(balance)} is now owed.`, res.id),
      );
    }
    stmts.push(
      activity(db, "payment.corrected", "reservation", res.id, `Payment ${original.receipt_number ?? ""} corrected by ${naira(input.amountKobo)} for ${res.reference}: ${why}`, {
        payment_id: original.id,
        correction_id: id,
        amount_kobo: input.amountKobo,
      }),
    );
    await writeBatch(db, actor, stmts);
    const row = await first<{ receipt_number: string }>(db, "SELECT receipt_number FROM payments WHERE id = ?", id);
    return { receiptNumber: row!.receipt_number, balanceKobo: Math.max(0, balance) };
  });
}
