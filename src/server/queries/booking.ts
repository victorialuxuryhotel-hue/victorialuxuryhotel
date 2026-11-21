import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import type { AvailabilityOption } from "@/domain/views";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { all, first, getDb } from "../db";
import { searchAvailability } from "../domain/inventory";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const staySchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.coerce.number().int().min(1).max(20),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "Check-out must be after check-in", path: ["checkOut"] });

export type Stay = z.infer<typeof staySchema>;

/**
 * Live availability for the website: prices and a yes/no flag per room type
 * only (room counts never leave the server).
 */
export async function searchStay(stay: Stay): Promise<{ ok: true; options: AvailabilityOption[] } | { ok: false; message: string }> {
  // Live data and "today" checks: always at request time, never prerendered.
  await connection();
  try {
    const rows = await searchAvailability(await getDb(), stay.checkIn, stay.checkOut, stay.guests);
    return {
      ok: true,
      options: rows.map((c) => ({
        slug: c.slug,
        name: c.name,
        summary: c.short_description ?? "",
        maxOccupancy: c.max_occupancy,
        isAvailable: c.is_available,
        nightlyRateKobo: c.nightly_rate_kobo,
        totalKobo: c.total_kobo,
        nights: c.nights,
      })),
    };
  } catch (err) {
    if (err instanceof AppError && err.code === "VALIDATION") return { ok: false, message: err.message };
    // Next cancels in-flight work when a prerender/prefetch completes. That is
    // not a failed search: let Next handle it rather than rendering a
    // "couldn't check availability" message into the prefetched page.
    if (err instanceof Error && /During prerendering|prerender/i.test(err.message)) throw err;
    logger.error("booking.search_failed", err);
    return { ok: false, message: "We couldn't check availability just now. Please try again." };
  }
}

type BookingRow = {
  id: string; reference: string; status: string; check_in: string; check_out: string; nights: number; guest_count: number;
  nightly_rate_kobo: number; total_amount_kobo: number; hold_expires_at: string | null; special_requests: string | null; attention_reason: string | null;
  guest_full_name: string; guest_email: string | null; guest_phone: string | null;
  category_slug: string; category_name: string; category_short_description: string | null; category_max_occupancy: number;
};

/** Loads a held booking by its unguessable token, for the guest's review and confirmation pages. */
export async function getBookingByToken(token: string) {
  await connection();
  if (!z.uuid().safeParse(token).success) return null;
  try {
    const db = await getDb();
    const r = await first<BookingRow>(
      db,
      `SELECT r.id, r.reference, r.status, r.check_in, r.check_out, r.nights, r.guest_count, r.nightly_rate_kobo, r.total_amount_kobo,
              r.hold_expires_at, r.special_requests, r.attention_reason,
              g.full_name AS guest_full_name, g.email AS guest_email, g.phone AS guest_phone,
              c.slug AS category_slug, c.name AS category_name, c.short_description AS category_short_description, c.max_occupancy AS category_max_occupancy
       FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id
       WHERE r.public_token = ?`,
      token,
    );
    if (!r) return null;
    const payments = await all<{ provider: string; provider_reference: string | null; status: string; amount_kobo: number; kind: string; receipt_number: string | null; created_at: string }>(
      db,
      "SELECT provider, provider_reference, status, amount_kobo, kind, receipt_number, created_at FROM payments WHERE reservation_id = ? ORDER BY created_at DESC",
      r.id,
    );
    // Decided here (request time), not during render.
    const holdActive = r.status === "pending_payment" && Boolean(r.hold_expires_at) && Date.parse(r.hold_expires_at!) > Date.now();
    const paystack = payments.filter((p) => p.provider === "paystack");
    const paidKobo = payments.filter((p) => p.status === "successful").reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0);
    const receipt = payments.find((p) => p.status === "successful" && p.receipt_number)?.receipt_number ?? undefined;
    return {
      id: r.id,
      reference: r.reference,
      status: r.status,
      check_in: r.check_in,
      check_out: r.check_out,
      nights: r.nights,
      guest_count: r.guest_count,
      nightly_rate_kobo: r.nightly_rate_kobo,
      total_amount_kobo: r.total_amount_kobo,
      hold_expires_at: r.hold_expires_at,
      special_requests: r.special_requests,
      attention_reason: r.attention_reason,
      guest: { full_name: r.guest_full_name, email: r.guest_email, phone: r.guest_phone },
      category: { slug: r.category_slug, name: r.category_name, short_description: r.category_short_description, max_occupancy: r.category_max_occupancy },
      payments,
      holdActive,
      latestAttempt: paystack[0],
      paidKobo,
      receipt,
    };
  } catch (err) {
    logger.error("booking.load_failed", err);
    return null;
  }
}

/** Booking rules the website needs (public information). */
export async function publicBookingRules() {
  const data = await first<{ check_in_time: string; check_out_time: string; website_hold_minutes: number; cancellation_policy: string | null }>(
    await getDb(),
    "SELECT check_in_time, check_out_time, website_hold_minutes, cancellation_policy FROM hotel_settings WHERE id = 1",
  );
  return {
    checkInTime: data?.check_in_time ?? "14:00",
    checkOutTime: data?.check_out_time ?? "12:00",
    holdMinutes: data?.website_hold_minutes ?? 30,
    cancellationPolicy: data?.cancellation_policy ?? null,
  };
}
