import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { addDays, hotelToday } from "@/lib/hotel-date";
import { activity, all, EVENTS_STAFF, first, requireRole, uuid, writeBatch, type Actor, type Db } from "../db";

/**
 * Conference hall: enquiries and confirmed events, with payments. The
 * database refuses two confirmed events at the same time. Payments can't be
 * edited or deleted.
 */
export type HallStatus = "enquiry" | "confirmed" | "cancelled";
export type HallMethod = "cash" | "bank_transfer" | "pos_terminal" | "card";

export type HallBooking = {
  id: string; title: string; customer_name: string; phone: string | null; email: string | null; event_date: string; start_time: string; end_time: string;
  guests: number | null; price_kobo: number; status: HallStatus; notes: string | null; paid_kobo: number;
};

export async function listHallBookings(db: Db, actor: Actor, today = hotelToday()): Promise<HallBooking[]> {
  requireRole(actor, EVENTS_STAFF);
  return all<HallBooking>(
    db,
    `SELECT h.id, h.title, h.customer_name, h.phone, h.email, h.event_date, h.start_time, h.end_time, h.guests, h.price_kobo, h.status, h.notes,
            (SELECT coalesce(sum(p.amount_kobo), 0) FROM hall_payments p WHERE p.booking_id = h.id) AS paid_kobo
     FROM hall_bookings h WHERE h.event_date >= ? ORDER BY h.event_date, h.start_time LIMIT 200`,
    addDays(today, -7),
  );
}

export async function createHallBooking(
  db: Db,
  actor: Actor,
  v: { title: string; customerName: string; phone: string | null; email: string | null; eventDate: string; startTime: string; endTime: string; guests: number | null; priceKobo: number; status: Exclude<HallStatus, "cancelled">; notes: string | null },
): Promise<string> {
  requireRole(actor, EVENTS_STAFF);
  if (v.endTime <= v.startTime) throw new AppError("VALIDATION", "The end time must be after the start time.");
  if (v.eventDate < hotelToday()) throw new AppError("VALIDATION", "Choose today or a later date.");
  const id = uuid();
  await writeBatch(db, actor, [
    db
      .prepare(
        `INSERT INTO hall_bookings (id, title, customer_name, phone, email, event_date, start_time, end_time, guests, price_kobo, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, v.title.trim(), v.customerName.trim(), v.phone, v.email, v.eventDate, v.startTime, v.endTime, v.guests, v.priceKobo, v.status, v.notes, actor.id),
    activity(db, "hall.created", "hall_booking", id, `Hall ${v.status}: ${v.title.trim()} on ${v.eventDate} ${v.startTime}–${v.endTime} (${v.customerName.trim()})`),
  ]);
  return id;
}

export async function setHallStatus(db: Db, actor: Actor, id: string, status: Exclude<HallStatus, "enquiry">): Promise<void> {
  requireRole(actor, EVENTS_STAFF);
  const [r] = await writeBatch(db, actor, [
    db.prepare(`UPDATE hall_bookings SET status = ? WHERE id = ? AND status <> 'cancelled' AND status <> ?`).bind(status, id, status),
    activity(db, `hall.${status}`, "hall_booking", id, `Hall booking ${status}`),
  ]);
  if (!r?.meta.changes) throw new AppError("INVALID_TRANSITION", "That booking can't change to this status.");
}

export async function recordHallPayment(
  db: Db,
  actor: Actor,
  v: { bookingId: string; amountKobo: number; method: HallMethod; paidOn: string; reference: string | null },
): Promise<void> {
  requireRole(actor, EVENTS_STAFF);
  const b = await first<{ title: string; price_kobo: number; status: HallStatus; paid: number }>(
    db,
    "SELECT title, price_kobo, status, (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = h.id) AS paid FROM hall_bookings h WHERE id = ?",
    v.bookingId,
  );
  if (!b) throw new AppError("NOT_FOUND", "Hall booking not found.");
  if (b.status === "cancelled") throw new AppError("INVALID_TRANSITION", "This booking is cancelled.");
  if (b.price_kobo > 0 && b.paid + v.amountKobo > b.price_kobo) throw new AppError("VALIDATION", `That's more than the ${formatNaira(b.price_kobo - b.paid)} still due.`);
  if (v.paidOn > hotelToday()) throw new AppError("VALIDATION", "The date can't be in the future.");
  const id = uuid();
  await writeBatch(db, actor, [
    db
      .prepare("INSERT INTO hall_payments (id, booking_id, amount_kobo, method, paid_on, reference, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, v.bookingId, v.amountKobo, v.method, v.paidOn, v.reference, actor.id),
    activity(db, "hall.payment", "hall_booking", v.bookingId, `Hall payment ${formatNaira(v.amountKobo)} for ${b.title}`),
  ]);
}
