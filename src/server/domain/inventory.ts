import { AppError } from "@/lib/errors";
import { addDays, hotelToday, isIsoDate, nightsBetween } from "@/lib/hotel-date";
import { first, type Db } from "../db";

/**
 * Inventory: how many units of a room type are free across a stay.
 *
 * Mirrors the capacity trigger (migrations/0002): capacity is active,
 * in-service rooms; demand is other LIVE reservations (confirmed, in house,
 * or awaiting payment with an unexpired hold), counted against their
 * assigned room's category if any, else the booked one. The app checks this
 * first to give a clear message; the trigger is the guarantee.
 */

/** SQL condition: reservation alias `r` holds inventory right now. */
export const LIVE_SQL = `(r.status IN ('confirmed', 'checked_in') OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`;

export async function freeUnits(db: Db, categoryId: string, checkIn: string, checkOut: string, excludeReservationId: string | null = null): Promise<number> {
  const row = await first<{ free: number }>(
    db,
    `SELECT
       (SELECT count(*) FROM rooms WHERE category_id = ?1 AND is_active = 1 AND service_status = 'in_service')
       - coalesce((
           SELECT max((
             SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
             WHERE r.check_in <= c.d AND r.check_out > c.d AND r.id IS NOT ?4 AND ${LIVE_SQL}
               AND coalesce(rm.category_id, r.category_id) = ?1
           ))
           FROM calendar c WHERE c.d >= ?2 AND c.d < ?3
         ), 0) AS free`,
    categoryId,
    checkIn,
    checkOut,
    excludeReservationId,
  );
  return row?.free ?? 0;
}

export type AvailabilityRow = {
  category_id: string;
  slug: string;
  name: string;
  short_description: string | null;
  max_occupancy: number;
  nightly_rate_kobo: number;
  nights: number;
  total_kobo: number;
  is_available: boolean;
};

/**
 * Public availability search (website). Prices and yes/no only: room counts
 * are internal and never leave the server through this path.
 */
export async function searchAvailability(db: Db, checkIn: string, checkOut: string, guests: number): Promise<AvailabilityRow[]> {
  validateStay(checkIn, checkOut, guests);
  const nights = nightsBetween(checkIn, checkOut);
  const { results } = await db
    .prepare(
      `SELECT c.id AS category_id, c.slug, c.name, c.short_description, c.max_occupancy, c.nightly_rate_kobo,
         (SELECT count(*) FROM rooms WHERE category_id = c.id AND is_active = 1 AND service_status = 'in_service')
         - coalesce((
             SELECT max((
               SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
               WHERE r.check_in <= cal.d AND r.check_out > cal.d AND ${LIVE_SQL}
                 AND coalesce(rm.category_id, r.category_id) = c.id
             ))
             FROM calendar cal WHERE cal.d >= ?1 AND cal.d < ?2
           ), 0) AS free
       FROM room_categories c
       WHERE c.is_active = 1
       ORDER BY c.sort_order, c.nightly_rate_kobo`,
    )
    .bind(checkIn, checkOut)
    .all<Omit<AvailabilityRow, "nights" | "total_kobo" | "is_available"> & { free: number }>();
  return results.map(({ free, ...c }) => ({
    ...c,
    nights,
    total_kobo: c.nightly_rate_kobo * nights,
    is_available: c.max_occupancy >= guests && free > 0,
  }));
}

/**
 * Whether each of the given room types has at least one room free on each
 * night from `from` (inclusive) to `to` (exclusive). Yes/no only: like the
 * search, no counts leave this function. Used to suggest nearby dates when a
 * type is full.
 */
export async function freeNights(db: Db, slugs: string[], from: string, to: string): Promise<Map<string, Map<string, boolean>>> {
  const out = new Map<string, Map<string, boolean>>(slugs.map((s) => [s, new Map()]));
  if (slugs.length === 0 || to <= from) return out;
  const { results } = await db
    .prepare(
      `SELECT c.slug, cal.d,
         (SELECT count(*) FROM rooms WHERE category_id = c.id AND is_active = 1 AND service_status = 'in_service')
         > (SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
            WHERE r.check_in <= cal.d AND r.check_out > cal.d AND ${LIVE_SQL}
              AND coalesce(rm.category_id, r.category_id) = c.id) AS is_free
       FROM room_categories c JOIN calendar cal ON cal.d >= ?1 AND cal.d < ?2
       WHERE c.is_active = 1 AND c.slug IN (${slugs.map((_, i) => `?${i + 3}`).join(", ")})`,
    )
    .bind(from, to, ...slugs)
    .all<{ slug: string; d: string; is_free: number }>();
  for (const r of results) out.get(r.slug)?.set(r.d, r.is_free === 1);
  return out;
}

/** Stay rules shared by the website and staff (same messages as before). */
export function validateStay(checkIn: string | null | undefined, checkOut: string | null | undefined, guests: number | null | undefined, allowPast = false): asserts checkIn is string {
  if (!checkIn || !checkOut || !isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new AppError("VALIDATION", "Choose check-in and check-out dates.");
  if (checkOut <= checkIn) throw new AppError("VALIDATION", "Check-out must be after check-in.");
  if (nightsBetween(checkIn, checkOut) > 90) throw new AppError("VALIDATION", "Stays longer than 90 nights must be arranged with the hotel.");
  const today = hotelToday();
  if (!allowPast && checkIn < today) throw new AppError("VALIDATION", "Check-in can't be in the past.");
  if (checkIn > addDays(today, 730)) throw new AppError("VALIDATION", "Bookings open up to two years ahead.");
  if (guests == null || !Number.isInteger(guests) || guests < 1 || guests > 20) throw new AppError("VALIDATION", "Enter the number of guests.");
}
