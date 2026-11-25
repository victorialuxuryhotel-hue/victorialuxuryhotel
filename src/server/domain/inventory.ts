import { AppError } from "@/lib/errors";
import { addDays, hotelToday, isIsoDate, nightsBetween } from "@/lib/hotel-date";
import { all, first, type Db, type Stmt } from "../db";

/**
 * When a stay stops holding its room. A checked-in guest holds the room until they are checked
 * out, whatever the booking dates say: an overstay runs to at least tomorrow (hotel time, UTC+1).
 * Matches the database rules in migrations/0014_occupied_until_checked_out.sql.
 */
export const stayEndSql = (a: string) => `(CASE WHEN ${a}.status = 'checked_in' THEN max(${a}.check_out, date('now', '+1 hour', '+1 day')) ELSE ${a}.check_out END)`;

export const LIVE_SQL = `(r.status IN ('confirmed', 'checked_in') OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`;

export async function freeUnits(db: Db, categoryId: string, checkIn: string, checkOut: string, excludeReservationId: string | null = null): Promise<number> {
  const row = await first<{ free: number }>(
    db,
    `SELECT
       (SELECT count(*) FROM rooms WHERE category_id = ?1 AND is_active = 1 AND service_status = 'in_service')
       - coalesce((
           SELECT max((
             SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
             WHERE r.check_in <= c.d AND ${stayEndSql("r")} > c.d AND r.id IS NOT ?4 AND ${LIVE_SQL}
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
               WHERE r.check_in <= cal.d AND ${stayEndSql("r")} > cal.d AND ${LIVE_SQL}
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

export async function freeNights(db: Db, slugs: string[], from: string, to: string): Promise<Map<string, Map<string, boolean>>> {
  const out = new Map<string, Map<string, boolean>>(slugs.map((s) => [s, new Map()]));
  if (slugs.length === 0 || to <= from) return out;
  const { results } = await db
    .prepare(
      `SELECT c.slug, cal.d,
         (SELECT count(*) FROM rooms WHERE category_id = c.id AND is_active = 1 AND service_status = 'in_service')
         > (SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
            WHERE r.check_in <= cal.d AND ${stayEndSql("r")} > cal.d AND ${LIVE_SQL}
              AND coalesce(rm.category_id, r.category_id) = c.id) AS is_free
       FROM room_categories c JOIN calendar cal ON cal.d >= ?1 AND cal.d < ?2
       WHERE c.is_active = 1 AND c.slug IN (${slugs.map((_, i) => `?${i + 3}`).join(", ")})`,
    )
    .bind(from, to, ...slugs)
    .all<{ slug: string; d: string; is_free: number }>();
  for (const r of results) out.get(r.slug)?.set(r.d, r.is_free === 1);
  return out;
}

export function validateStay(checkIn: string | null | undefined, checkOut: string | null | undefined, guests: number | null | undefined, allowPast = false): asserts checkIn is string {
  if (!checkIn || !checkOut || !isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new AppError("VALIDATION", "Choose check-in and check-out dates.");
  if (checkOut <= checkIn) throw new AppError("VALIDATION", "Check-out must be after check-in.");
  if (nightsBetween(checkIn, checkOut) > 90) throw new AppError("VALIDATION", "Stays longer than 90 nights must be arranged with the hotel.");
  const today = hotelToday();
  if (!allowPast && checkIn < today) throw new AppError("VALIDATION", "Check-in can't be in the past.");
  if (checkIn > addDays(today, 730)) throw new AppError("VALIDATION", "Bookings open up to two years ahead.");
  if (guests == null || !Number.isInteger(guests) || guests < 1 || guests > 20) throw new AppError("VALIDATION", "Enter the number of guests.");
}

export function autoAssignRoomStatements(db: Db, reservationId: string): Stmt[] {
  return [
    db
      .prepare(
        `UPDATE reservations SET room_id = (
           SELECT rm.id FROM rooms rm
           WHERE rm.category_id = reservations.category_id AND rm.is_active = 1 AND rm.service_status = 'in_service'
             AND NOT EXISTS (
               SELECT 1 FROM reservations o WHERE o.room_id = rm.id AND o.id <> reservations.id
                 AND o.status IN ('pending_payment', 'confirmed', 'checked_in')
                 AND o.check_in < reservations.check_out AND reservations.check_in < ${stayEndSql("o")})
           ORDER BY rm.readiness = 'ready' DESC, length(rm.room_number), rm.room_number
           LIMIT 1)
         WHERE id = ? AND room_id IS NULL`,
      )
      .bind(reservationId),
    db
      .prepare(
        `INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
         SELECT NULL, 'system', 'reservation.room_auto_assigned', 'reservation', r.id,
                'Room ' || rm.room_number || ' assigned automatically to ' || r.reference || ' on payment',
                json_object('room_id', rm.id)
         FROM reservations r JOIN rooms rm ON rm.id = r.room_id
         WHERE r.id = ?`,
      )
      .bind(reservationId),
  ];
}

/** Stays that put a guest in a room today: everyone checked in (whatever their dates), plus today's arrivals and departures. */
export function roomStays(db: Db, today: string) {
  return all<{ id: string; room_id: string; status: string; check_in: string; check_out: string; guest_name: string }>(
    db,
    `SELECT r.id, r.room_id, r.status, r.check_in, r.check_out, g.full_name AS guest_name
     FROM reservations r JOIN guests g ON g.id = r.guest_id
     WHERE r.room_id IS NOT NULL AND r.status IN ('checked_in', 'confirmed', 'pending_payment')
       AND (r.status = 'checked_in' OR (r.check_in <= ?1 AND r.check_out >= ?1))`,
    today,
  );
}

/** Rooms in service and free for every night of the stay. A room with a guest checked in is never free. */
export function freeRooms(db: Db, reservationId: string, checkIn: string, checkOut: string) {
  return all<{ id: string; room_number: string; readiness: string; category_name: string }>(
    db,
    `SELECT rm.id, rm.room_number, rm.readiness, c.name AS category_name
     FROM rooms rm JOIN room_categories c ON c.id = rm.category_id
     WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
       AND NOT EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.room_id = rm.id AND r.id <> ?1 AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
           AND r.check_in < ?3 AND ${stayEndSql("r")} > ?2)`,
    reservationId,
    checkIn,
    checkOut,
  );
}
