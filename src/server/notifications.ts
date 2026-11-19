import "server-only";
import { alert } from "@/lib/alert";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { paymentMethod } from "@/domain/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./email/send";
import { bookingConfirmedEmail, hotelNewBookingEmail, paymentReceivedEmail, reservationCancelledEmail, type StayInfo } from "./email/templates";

/**
 * Delivers queued emails from the outbox. Emails are queued by database
 * triggers in the same transaction as the change that causes them, so none
 * is lost if the app stops between committing and sending. This runs after
 * the response (via after()) and from the scheduled job; rows are claimed with
 * SKIP LOCKED and sent with the outbox id as the idempotency key, so
 * concurrent runs and retries never send twice. Never throws.
 */

const timeLabel = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h === 12 && m === 0 ? "12:00 noon" : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

async function loadStay(reservationId: string): Promise<(StayInfo & { email: string | null; source: string; receipt?: string }) | null> {
  const db = createAdminClient();
  const [{ data: r }, { data: settings }] = await Promise.all([
    db
      .from("reservations")
      .select("reference, check_in, check_out, nights, guest_count, total_amount_kobo, source, guest:guests!inner(full_name, email), category:room_categories!inner(name), payments(amount_kobo, kind, status, receipt_number, created_at)")
      .eq("id", reservationId)
      .maybeSingle(),
    db.from("hotel_settings").select("check_in_time, check_out_time").single(),
  ]);
  if (!r) return null;
  const ok = r.payments.filter((p) => p.status === "successful").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    guestName: r.guest.full_name,
    email: r.guest.email,
    reference: r.reference,
    category: r.category.name,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights ?? 0,
    guests: r.guest_count,
    totalKobo: r.total_amount_kobo,
    paidKobo: ok.reduce((s, p) => s + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0),
    source: r.source,
    receipt: ok[0]?.receipt_number ?? undefined,
    checkInTime: timeLabel(settings?.check_in_time ?? "14:00"),
    checkOutTime: timeLabel(settings?.check_out_time ?? "12:00"),
  };
}

type OutboxRow = { id: string; kind: "booking_confirmed" | "payment_received" | "reservation_cancelled"; reservation_id: string; payment_id: string | null; attempts: number };

/** Sends one queued email. Returns "sent" | "skipped" (no address) | an error message. */
async function deliver(row: OutboxRow): Promise<"sent" | "skipped" | string> {
  const stay = await loadStay(row.reservation_id);
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
  const { data: p } = await createAdminClient().from("payments").select("amount_kobo, receipt_number, method").eq("id", row.payment_id!).single();
  if (!p?.receipt_number) return "skipped";
  const email = paymentReceivedEmail({ ...stay, amountKobo: p.amount_kobo, receiptNumber: p.receipt_number, method: paymentMethod[(p.method ?? "other") as keyof typeof paymentMethod] }, site);
  return (await sendEmail({ to: stay.email, ...email, idempotencyKey: row.id })) ? "sent" : "Payment receipt could not be sent";
}

/** `reservationId` sends that booking's emails first (used right after an action). */
export async function deliverEmails(opts: { limit?: number; reservationId?: string } = {}): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  try {
    const db = createAdminClient();
    const { data: rows, error } = await db.rpc("claim_outbox", { p_limit: opts.limit ?? 20, p_reservation: opts.reservationId });
    if (error) throw error;
    for (const row of (rows ?? []) as OutboxRow[]) {
      let outcome: string;
      try {
        outcome = await deliver(row);
      } catch (err) {
        outcome = err instanceof Error ? err.message : "error";
      }
      const status = outcome === "sent" || outcome === "skipped" ? outcome : "retry";
      await db.rpc("finish_outbox", { p_id: row.id, p_status: status, p_error: status === "retry" ? outcome : undefined });
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
