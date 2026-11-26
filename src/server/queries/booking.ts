import "server-only";
import { cancellationRuleText } from "@/lib/cancellation";
import { cancellationFee, cancelRule } from "../domain/cancellation-rule";
import type { PaymentMethod } from "@/domain/status";
import { connection } from "next/server";
import { z } from "zod";
import { nearestFreeStart } from "@/domain/availability";
import type { AvailabilityOption } from "@/domain/views";
import { AppError } from "@/lib/errors";
import { addDays, nightsBetween, tonight } from "@/lib/hotel-date";
import { publicText, roomLabel } from "@/lib/format";
import { logger } from "@/lib/logger";
import { all, first, getDb } from "../db";
import { freeNights, searchAvailability } from "../domain/inventory";
import { coverPhotos } from "./catalogue";
import { VAT_SHOWN_SQL } from "../vat";

const SUGGEST_WITHIN_DAYS = 14;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const staySchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.coerce.number().int().min(1).max(20),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "Check-out must be after check-in", path: ["checkOut"] });

export type Stay = z.infer<typeof staySchema>;

export async function searchStay(stay: Stay): Promise<{ ok: true; options: AvailabilityOption[] } | { ok: false; message: string }> {
  await connection();
  try {
    const db = await getDb();
    const rows = await searchAvailability(db, stay.checkIn, stay.checkOut, stay.guests);
    const full = rows.filter((c) => !c.is_available && c.max_occupancy >= stay.guests);
    const nights = nightsBetween(stay.checkIn, stay.checkOut);
    const today = tonight();
    const from = [addDays(stay.checkIn, -SUGGEST_WITHIN_DAYS), today].sort().at(-1)!;
    const [free, photos] = await Promise.all([
      full.length ? freeNights(db, full.map((c) => c.slug), from, addDays(stay.checkOut, SUGGEST_WITHIN_DAYS)) : Promise.resolve(new Map<string, Map<string, boolean>>()),
      coverPhotos(db),
    ]);
    return {
      ok: true,
      options: rows.map((c) => ({
        freeFrom: free.get(c.slug) ? (nearestFreeStart(free.get(c.slug)!, stay.checkIn, nights, today, SUGGEST_WITHIN_DAYS) ?? undefined) : undefined,
        slug: c.slug,
        name: c.name,
        summary: publicText(c.short_description),
        maxOccupancy: c.max_occupancy,
        isAvailable: c.is_available,
        nightlyRateKobo: c.nightly_rate_kobo,
        totalKobo: c.total_kobo,
        nights: c.nights,
        photo: photos.get(c.slug),
      })),
    };
  } catch (err) {
    if (err instanceof AppError && err.code === "VALIDATION") return { ok: false, message: err.message };
    if (err instanceof Error && /During prerendering|prerender/i.test(err.message)) throw err;
    logger.error("booking.search_failed", err);
    return { ok: false, message: "We couldn't check availability just now. Please try again." };
  }
}

type BookingRow = {
  id: string; reference: string; status: string; check_in: string; check_out: string; nights: number; guest_count: number;
  nightly_rate_kobo: number; total_amount_kobo: number; extras_kobo: number; room_change_kobo: number; discount_kobo: number; promo_code: string | null; hold_expires_at: string | null; special_requests: string | null; attention_reason: string | null;
  guest_full_name: string; guest_email: string | null; guest_phone: string | null;
  category_slug: string; category_name: string; category_short_description: string | null; category_max_occupancy: number;
  room_number: string | null; room_floor: string | null; room_category: string | null;
};

export async function getBookingByToken(token: string) {
  await connection();
  if (!z.uuid().safeParse(token).success) return null;
  try {
    const db = await getDb();
    const r = await first<BookingRow>(
      db,
      `SELECT r.id, r.reference, r.status, r.check_in, r.check_out, r.nights, r.guest_count, r.nightly_rate_kobo, r.total_amount_kobo, r.extras_kobo, r.room_change_kobo, r.discount_kobo, r.promo_code,
              r.hold_expires_at, r.special_requests, r.attention_reason,
              g.full_name AS guest_full_name, g.email AS guest_email, g.phone AS guest_phone,
              c.slug AS category_slug, c.name AS category_name, c.short_description AS category_short_description, c.max_occupancy AS category_max_occupancy,
              rm.room_number, rm.floor AS room_floor, rc.name AS room_category
       FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id
       LEFT JOIN rooms rm ON rm.id = r.room_id LEFT JOIN room_categories rc ON rc.id = rm.category_id
       WHERE r.public_token = ?`,
      token,
    );
    if (!r) return null;
    const photos = await coverPhotos(db);
    const payments = await all<{ provider: string; provider_reference: string | null; status: string; amount_kobo: number; kind: string; receipt_number: string | null; created_at: string }>(
      db,
      "SELECT provider, provider_reference, status, amount_kobo, kind, receipt_number, created_at FROM payments WHERE reservation_id = ? ORDER BY created_at DESC",
      r.id,
    );
    const holdActive = r.status === "pending_payment" && Boolean(r.hold_expires_at) && Date.parse(r.hold_expires_at!) > Date.now();
    // Already inside the late-cancellation window (e.g. a same-day booking): the review page says so before payment.
    const lateCancelNow = cancellationFee(r.total_amount_kobo, r.check_in, await cancelRule(db)) > 0;
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
      extras_kobo: r.extras_kobo,
      discount_kobo: r.discount_kobo,
      promo_code: r.promo_code,
      due_kobo: r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo,
      extras: await all<{ name: string; unit_price_kobo: number; per_night: number }>(db, "SELECT name, unit_price_kobo, per_night FROM reservation_extras WHERE reservation_id = ? ORDER BY name", r.id),
      hold_expires_at: r.hold_expires_at,
      special_requests: r.special_requests,
      attention_reason: r.attention_reason,
      guest: { full_name: r.guest_full_name, email: r.guest_email, phone: r.guest_phone },
      photo: photos.get(r.category_slug),
      category: { slug: r.category_slug, name: r.category_name, short_description: publicText(r.category_short_description), max_occupancy: r.category_max_occupancy },
      room: r.room_number ? roomLabel(r.room_number, r.room_floor) : undefined,
      roomCategory: r.room_category ?? r.category_name,
      payments,
      holdActive,
      lateCancelNow,
      latestAttempt: paystack[0],
      paidKobo,
      receipt,
    };
  } catch (err) {
    logger.error("booking.load_failed", err);
    return null;
  }
}

export async function getGuestReceipt(token: string, receiptNumber: string) {
  await connection();
  if (!z.uuid().safeParse(token).success || !/^RCT-\d{4}-\d{6}$/.test(receiptNumber)) return null;
  const db = await getDb();
  const r = await first<{ id: string; reference: string; check_in: string; check_out: string; nights: number; total_amount_kobo: number; guest: string; category: string; room_number: string | null; room_floor: string | null }>(
    db,
    `SELECT r.id, r.reference, r.check_in, r.check_out, r.nights, (r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo) AS total_amount_kobo, g.full_name AS guest,
            coalesce(rc.name, c.name) AS category, rm.room_number, rm.floor AS room_floor
     FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id
     LEFT JOIN rooms rm ON rm.id = r.room_id LEFT JOIN room_categories rc ON rc.id = rm.category_id WHERE r.public_token = ?`,
    token,
  );
  if (!r) return null;
  const [p, paid] = await Promise.all([
    first<{ receipt_number: string; paid_at: string | null; method: string | null; provider: "paystack" | "offline"; provider_reference: string | null; amount_kobo: number }>(
      db,
      "SELECT receipt_number, paid_at, method, provider, provider_reference, amount_kobo FROM payments WHERE reservation_id = ? AND receipt_number = ? AND status = 'successful' AND kind = 'payment'",
      r.id, receiptNumber,
    ),
    first<{ kobo: number }>(
      db,
      "SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_kobo ELSE -amount_kobo END), 0) AS kobo FROM payments WHERE reservation_id = ? AND status = 'successful'",
      r.id,
    ),
  ]);
  if (!p) return null;
  const vat = await first<{ vat_rate_bp: number; tax_id: string | null }>(db, `SELECT ${VAT_SHOWN_SQL} AS vat_rate_bp, tax_id FROM hotel_settings WHERE id = 1`);
  return {
    vatRateBp: vat?.vat_rate_bp ?? 0,
    taxId: vat?.tax_id ?? null,
    payment: {
      receiptNumber: p.receipt_number, paidAt: p.paid_at ?? undefined, method: (p.provider === "paystack" ? "card" : (p.method ?? "other")) as PaymentMethod,
      provider: p.provider, providerReference: p.provider_reference ?? undefined, amountKobo: p.amount_kobo,
    },
    reservation: {
      guestName: r.guest, reference: r.reference, category: r.category, room: r.room_number ? roomLabel(r.room_number, r.room_floor) : undefined, nights: r.nights ?? 0, checkIn: r.check_in, checkOut: r.check_out,
      totalKobo: r.total_amount_kobo, paidKobo: paid?.kobo ?? 0,
    },
  };
}

export async function publicBookingRules() {
  const data = await first<{
    check_in_time: string; check_out_time: string; website_hold_minutes: number; cancellation_policy: string | null;
    free_cancel_hours: number; late_cancel_fee_pct: number;
  }>(
    await getDb(),
    "SELECT check_in_time, check_out_time, website_hold_minutes, cancellation_policy, free_cancel_hours, late_cancel_fee_pct FROM hotel_settings WHERE id = 1",
  );
  return {
    checkInTime: data?.check_in_time ?? "00:00",
    checkOutTime: data?.check_out_time ?? "12:00",
    holdMinutes: data?.website_hold_minutes ?? 30,
    freeCancelHours: data?.free_cancel_hours ?? 24,
    lateCancelFeePct: data?.late_cancel_fee_pct ?? 50,
    cancellationPolicy: data?.cancellation_policy ?? (data ? cancellationRuleText(data.free_cancel_hours, data.late_cancel_fee_pct, data.check_in_time) : null),
  };
}

export { cancellationRuleText };

export async function publicExtras() {
  return all<{ id: string; name: string; price_kobo: number; per_night: number }>(
    await getDb(),
    "SELECT id, name, price_kobo, per_night FROM extras WHERE is_active = 1 ORDER BY sort_order, name",
  );
}
