import "server-only";
import { alert } from "@/lib/alert";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { paymentMethod } from "@/domain/status";
import { all, first, getDb, type Db } from "./db";
import { claimOutbox, finishOutbox, type OutboxRow } from "./domain/system";
import { sendEmail } from "./email/send";
import { bookingConfirmedEmail, hotelNewBookingEmail, paymentReceivedEmail, reservationCancelledEmail, type StayInfo } from "./email/templates";

/**
 * Delivers queued emails from the outbox. Emails are queued by database
 * triggers in the same transaction as the change that causes them, so none
 * is lost if the app stops between committing and sending. This runs after
 * the response (via after()) and from the scheduled job; each row is claimed
 * by exactly one sender (one atomic statement) and sent with the outbox id as
 * the idempotency key, so concurrent runs and retries never send twice.
 * Never throws.
 */

const timeLabel = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h === 12 && m === 0 ? "12:00 noon" : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

async function loadStay(db: Db, reservationId: string): Promise<(StayInfo & { email: string | null; source: string; receipt?: string }) | null> {
  const [r, settings, payments] = await Promise.all([
    first<{
      reference: string; check_in: string; check_out: string; nights: number; guest_count: number; total_amount_kobo: number;
      source: string; full_name: string; email: string | null; category: string;
    }>(
      db,
      `SELECT r.reference, r.check_in, r.check_out, r.nights, r.guest_count, r.total_amount_kobo, r.source,
              g.full_name, g.email, c.name AS category
       FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id
       WHERE r.id = ?`,
      reservationId,
    ),
    first<{ check_in_time: string; check_out_time: string }>(db, "SELECT check_in_time, check_out_time FROM hotel_settings WHERE id = 1"),
    all<{ amount_kobo: number; kind: string; receipt_number: string | null }>(
      db,
      "SELECT amount_kobo, kind, receipt_number FROM payments WHERE reservation_id = ? AND status = 'successful' ORDER BY created_at DESC",
      reservationId,
    ),
  ]);
  if (!r) return null;
  return {
    guestName: r.full_name,
    email: r.email,
    reference: r.reference,
    category: r.category,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights ?? 0,
    guests: r.guest_count,
    totalKobo: r.total_amount_kobo,
    paidKobo: payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0),
    source: r.source,
    receipt: payments[0]?.receipt_number ?? undefined,
    checkInTime: timeLabel(settings?.check_in_time ?? "14:00"),
    checkOutTime: timeLabel(settings?.check_out_time ?? "12:00"),
  };
}

/** Sends one queued email. Returns "sent" | "skipped" (no address) | an error message. */
async function deliver(db: Db, row: OutboxRow): Promise<"sent" | "skipped" | string> {
  const stay = await loadStay(db, row.reservation_id);
  if (!stay) return "skipped";
  const site = publicEnv().NEXT_PUBLIC_SITE_URL;

  if (row.kind === "booking_confirmed") {
    if (stay.email) {
      const ok = await sendEmail({ to: stay.email, ...bookingConfirmedEmail({ ...stay, receiptNumber: stay.receipt }, site), idempotencyKey: row.id });
      if (!ok) return "Guest confirmation could not be sent";
    }
    const inbox = serverEnv.hotelNotifyEmail();
    if (inbox) await sendEmail({ to: inbox, ...hotelNewBookingEmail(stay, stay.source, site), idempotencyKey: `${row.id}-hotel` });
    return stay.email ? "sent" : "skipped";
  }
  if (!stay.email) return "skipped";
  if (row.kind === "reservation_cancelled") {
    return (await sendEmail({ to: stay.email, ...reservationCancelledEmail(stay, site), idempotencyKey: row.id })) ? "sent" : "Cancellation email could not be sent";
  }
  const p = await first<{ amount_kobo: number; receipt_number: string | null; method: string | null }>(
    db,
    "SELECT amount_kobo, receipt_number, method FROM payments WHERE id = ?",
    row.payment_id,
  );
  if (!p?.receipt_number) return "skipped";
  const email = paymentReceivedEmail({ ...stay, amountKobo: p.amount_kobo, receiptNumber: p.receipt_number, method: paymentMethod[(p.method ?? "other") as keyof typeof paymentMethod] }, site);
  return (await sendEmail({ to: stay.email, ...email, idempotencyKey: row.id })) ? "sent" : "Payment receipt could not be sent";
}

/** `reservationId` sends that booking's emails first (used right after an action). */
export async function deliverEmails(opts: { limit?: number; reservationId?: string } = {}): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  try {
    const db = await getDb();
    const rows = await claimOutbox(db, { limit: opts.limit ?? 20, reservationId: opts.reservationId });
    for (const row of rows) {
      let outcome: string;
      try {
        outcome = await deliver(db, row);
      } catch (err) {
        outcome = err instanceof Error ? err.message : "error";
      }
      const status = outcome === "sent" || outcome === "skipped" ? outcome : "retry";
      await finishOutbox(db, row.id, status, status === "retry" ? outcome : undefined);
      if (status === "retry") {
        result.failed++;
        if (row.attempts >= 5) await alert("email_failed", `A ${row.kind.replace("_", " ")} email failed after 5 attempts`, { outboxId: row.id });
      } else if (status === "sent") result.sent++;
    }
  } catch (err) {
    logger.error("email.outbox_failed", err);
  }
  return result;
}
