import "server-only";
import { z } from "zod";
import type { AvailabilityOption } from "@/domain/views";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Live availability for the website. Runs the public database function, which
 * validates dates and returns prices and a yes/no flag per room type only.
 */
export async function searchStay(stay: Stay): Promise<{ ok: true; options: AvailabilityOption[] } | { ok: false; message: string }> {
  // Public data via the privileged client is safe here: the function only
  // exposes what anonymous visitors may see, and needs no session cookie.
  const { data, error } = await createAdminClient().rpc("search_availability", {
    p_check_in: stay.checkIn,
    p_check_out: stay.checkOut,
    p_guests: stay.guests,
  });
  if (error) {
    if (error.hint === "VALIDATION") return { ok: false, message: error.message };
    logger.error("booking.search_failed", error);
    return { ok: false, message: "We couldn't check availability just now. Please try again." };
  }
  return {
    ok: true,
    options: data.map((c) => ({
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
}

/** Loads a held booking by its unguessable token, for the guest's review page. */
export async function getBookingByToken(token: string) {
  if (!z.uuid().safeParse(token).success) return null;
  const { data, error } = await createAdminClient()
    .from("reservations")
    .select("id, reference, status, check_in, check_out, nights, guest_count, nightly_rate_kobo, total_amount_kobo, hold_expires_at, special_requests, attention_reason, guest:guests!inner(full_name, email, phone), category:room_categories!inner(slug, name, short_description, max_occupancy), payments(provider, provider_reference, status, amount_kobo, kind, receipt_number, created_at)")
    .eq("public_token", token)
    .maybeSingle();
  if (error) {
    logger.error("booking.load_failed", error);
    return null;
  }
  if (!data) return null;
  // Decided here (request time), not during render.
  const holdActive = data.status === "pending_payment" && Boolean(data.hold_expires_at) && Date.parse(data.hold_expires_at!) > Date.now();
  const paystack = data.payments.filter((p) => p.provider === "paystack").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const paidKobo = data.payments.filter((p) => p.status === "successful").reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0);
  const receipt = data.payments.find((p) => p.status === "successful" && p.receipt_number)?.receipt_number ?? undefined;
  return { ...data, holdActive, latestAttempt: paystack[0], paidKobo, receipt };
}

/** Booking rules the website needs (public information). */
export async function publicBookingRules() {
  const { data } = await createAdminClient().from("hotel_settings").select("check_in_time, check_out_time, website_hold_minutes, cancellation_policy").single();
  return {
    checkInTime: data?.check_in_time ?? "14:00",
    checkOutTime: data?.check_out_time ?? "12:00",
    holdMinutes: data?.website_hold_minutes ?? 30,
    cancellationPolicy: data?.cancellation_policy ?? null,
  };
}
