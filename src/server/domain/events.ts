import { AppError } from "@/lib/errors";
import { dbErrorToken } from "../db-errors";
import { formatNaira } from "@/lib/format";
import { addDays, hotelToday } from "@/lib/hotel-date";
import { activity, activityIfChanged, all, EVENTS_STAFF, first, requireRole, uuid, writeBatch, type Actor, type Db } from "../db";

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

export type HallPaymentRow = { id: string; amount_kobo: number; method: HallMethod; paid_on: string; reference: string | null; recorded_by_name: string | null; created_at: string };

/** One hall booking with its payments, for the invoice (A4 or 80mm). */
export async function hallInvoice(db: Db, actor: Actor, id: string): Promise<(HallBooking & { payments: HallPaymentRow[] }) | null> {
  requireRole(actor, EVENTS_STAFF);
  const b = await first<HallBooking>(
    db,
    `SELECT h.id, h.title, h.customer_name, h.phone, h.email, h.event_date, h.start_time, h.end_time, h.guests, h.price_kobo, h.status, h.notes,
            (SELECT coalesce(sum(p.amount_kobo), 0) FROM hall_payments p WHERE p.booking_id = h.id) AS paid_kobo
     FROM hall_bookings h WHERE h.id = ?`,
    id,
  );
  if (!b) return null;
  const payments = await all<HallPaymentRow>(
    db,
    `SELECT p.id, p.amount_kobo, p.method, p.paid_on, p.reference, s.full_name AS recorded_by_name, p.created_at
     FROM hall_payments p LEFT JOIN staff_profiles s ON s.id = p.recorded_by WHERE p.booking_id = ? ORDER BY p.created_at`,
    id,
  );
  return { ...b, payments };
}

export async function createHallBooking(
  db: Db,
  actor: Actor,
  v: { title: string; customerName: string; phone: string | null; email: string | null; eventDate: string; startTime: string; endTime: string; guests: number | null; priceKobo: number; notes: string | null },
): Promise<string> {
  requireRole(actor, EVENTS_STAFF);
  if (v.endTime <= v.startTime) throw new AppError("VALIDATION", "The end time must be after the start time.");
  if (v.eventDate < hotelToday()) throw new AppError("VALIDATION", "Choose today or a later date.");
  const id = uuid();
  await writeBatch(db, actor, [
    db
      .prepare(
        `INSERT INTO hall_bookings (id, title, customer_name, phone, email, event_date, start_time, end_time, guests, price_kobo, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enquiry', ?, ?)`,
      )
      .bind(id, v.title.trim(), v.customerName.trim(), v.phone, v.email, v.eventDate, v.startTime, v.endTime, v.guests, v.priceKobo, v.notes, actor.id),
    activity(db, "hall.created", "hall_booking", id, `Hall enquiry: ${v.title.trim()} on ${v.eventDate} ${v.startTime}–${v.endTime} (${v.customerName.trim()})`),
  ]);
  return id;
}

/** Confirmed means paid in full (rules I9), so the only status staff set by hand is cancelled. */
export async function setHallStatus(db: Db, actor: Actor, id: string, status: Exclude<HallStatus, "enquiry">): Promise<void> {
  requireRole(actor, EVENTS_STAFF);
  if (status === "confirmed") {
    const b = await first<{ price_kobo: number; paid: number }>(db, "SELECT price_kobo, (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = h.id) AS paid FROM hall_bookings h WHERE id = ?", id);
    if (!b) throw new AppError("NOT_FOUND", "Hall booking not found.");
    if (b.price_kobo <= 0) throw new AppError("VALIDATION", "Set the price first. A hall booking is confirmed once it's paid in full.");
    if (b.paid < b.price_kobo) throw new AppError("VALIDATION", `${formatNaira(b.price_kobo - b.paid)} is still owed. A hall booking is confirmed once it's paid in full.`);
  }
  const [r] = await writeBatch(db, actor, [
    db.prepare(`UPDATE hall_bookings SET status = ? WHERE id = ? AND status <> 'cancelled' AND status <> ?`).bind(status, id, status),
    activityIfChanged(db, `hall.${status}`, "hall_booking", id, `Hall booking ${status}`),
  ]);
  if (!r?.meta.changes) throw new AppError("INVALID_TRANSITION", "This hall booking is already cancelled, or already at that stage.");
}

export async function recordHallPayment(
  db: Db,
  actor: Actor,
  v: { bookingId: string; amountKobo: number; method: HallMethod; paidOn: string; reference: string | null; paymentId?: string },
): Promise<void> {
  requireRole(actor, EVENTS_STAFF);
  // Same form sent twice (double tap, or a retry on slow Wi-Fi): the payment is already recorded.
  if (v.paymentId) {
    const done = await first<{ booking_id: string }>(db, "SELECT booking_id FROM hall_payments WHERE id = ?", v.paymentId);
    if (done) {
      if (done.booking_id !== v.bookingId) throw new AppError("CONFLICT", "This form was already used. Reload and try again.");
      return;
    }
  }
  const b = await first<{ title: string; price_kobo: number; status: HallStatus; paid: number }>(
    db,
    "SELECT title, price_kobo, status, (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = h.id) AS paid FROM hall_bookings h WHERE id = ?",
    v.bookingId,
  );
  if (!b) throw new AppError("NOT_FOUND", "Hall booking not found.");
  if (b.status === "cancelled") throw new AppError("INVALID_TRANSITION", "This booking is cancelled.");
  if (b.price_kobo <= 0) throw new AppError("VALIDATION", "Set the price for this event before taking a payment.");
  if (v.method === "bank_transfer" && (v.reference?.trim().length ?? 0) < 3) {
    throw new AppError("VALIDATION", "For a bank transfer, enter the transfer reference or the sender's name, as shown in the hotel's bank app.");
  }
  if (v.method === "pos_terminal" && !/\d{4}/.test(v.reference ?? "")) {
    throw new AppError("VALIDATION", "This POS payment needs its slip number. Enter the last 4 digits of the slip, once the terminal says Approved.");
  }
  if (b.paid + v.amountKobo > b.price_kobo) throw new AppError("VALIDATION", `That's more than the ${formatNaira(b.price_kobo - b.paid)} owed.`);
  if (v.paidOn > hotelToday()) throw new AppError("VALIDATION", "The date can't be in the future.");
  const id = v.paymentId ?? uuid();
  let r;
  try {
    [r] = await writeBatch(db, actor, [
    db
      .prepare(
        `INSERT INTO hall_payments (id, booking_id, amount_kobo, method, paid_on, reference, recorded_by)
         SELECT ?1, h.id, ?3, ?4, ?5, ?6, ?7 FROM hall_bookings h
         WHERE h.id = ?2 AND h.status <> 'cancelled'
           AND h.price_kobo > 0 AND (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = h.id) + ?3 <= h.price_kobo`,
      )
      .bind(id, v.bookingId, v.amountKobo, v.method, v.paidOn, v.reference, actor.id),
    activityIfChanged(db, "hall.payment", "hall_booking", v.bookingId, `Hall payment ${formatNaira(v.amountKobo)} for ${b.title}`),
    // Paid in full: the booking is confirmed in the same step (refused if it would clash with another confirmed event).
    db
      .prepare(
        `UPDATE hall_bookings SET status = 'confirmed' WHERE id = ? AND status = 'enquiry'
           AND (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = hall_bookings.id) >= price_kobo`,
      )
      .bind(v.bookingId),
    activityIfChanged(db, "hall.confirmed", "hall_booking", v.bookingId, `Hall booking confirmed: paid in full`),
    ]);
  } catch (err) {
    // The same payment arriving twice at once: the first one recorded it.
    if (v.paymentId && err instanceof AppError && dbErrorToken(err.cause) === "unique" && (await first(db, "SELECT 1 FROM hall_payments WHERE id = ?", v.paymentId))) return;
    throw err;
  }
  if (!r?.meta.changes) throw new AppError("CONFLICT", "Someone just recorded a payment or changed this booking. Reload and try again.");
}
