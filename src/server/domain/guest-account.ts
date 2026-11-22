import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { hashCode } from "@/lib/guest-token";
import { hotelInstant, isIsoDate } from "@/lib/hotel-date";
import { activity, all, assertVersion, first, now, retryOnStale, writeBatch, type Db } from "../db";
import { changeDates, loadReservation, netPaid } from "./reservations";

/**
 * Guest self-service: sign in with a 6-digit code sent to the email on their
 * booking, see their bookings, cancel (under the cancellation rule) or change
 * dates. There is no actor: these run as the system, after checking the
 * booking belongs to the signed-in email.
 */

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

/** A new sign-in code for an email that has bookings; null (send nothing) when it has none. */
export async function issueGuestCode(db: Db, email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!(await first(db, "SELECT 1 FROM guests g JOIN reservations r ON r.guest_id = g.id WHERE g.email = ? LIMIT 1", e))) return null;
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
  await db
    .prepare("INSERT INTO guest_login_codes (email, code_hash, expires_at) VALUES (?, ?, ?)")
    .bind(e, await hashCode(e, code), new Date(Date.now() + CODE_MINUTES * 60_000).toISOString())
    .run();
  return code;
}

/** True if the code matches the latest unused, unexpired code for this email. Five tries per code. */
export async function checkGuestCode(db: Db, email: string, code: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const row = await first<{ id: number; code_hash: string; attempts: number }>(
    db,
    "SELECT id, code_hash, attempts FROM guest_login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1",
    e,
    now(),
  );
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;
  if (row.code_hash !== (await hashCode(e, code.trim()))) {
    await db.prepare("UPDATE guest_login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return false;
  }
  // Single use: only one request can mark it used.
  const used = await db.prepare("UPDATE guest_login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now(), row.id).run();
  return used.meta.changes === 1;
}

export type GuestBooking = {
  id: string; reference: string; token: string; status: string; checkIn: string; checkOut: string; nights: number; guests: number;
  category: string; dueKobo: number; paidKobo: number; canCancel: boolean; canChange: boolean; feeIfCancelledKobo: number;
};

export async function guestBookings(db: Db, email: string): Promise<GuestBooking[]> {
  const rows = await all<{
    id: string; reference: string; public_token: string; status: string; check_in: string; check_out: string; nights: number; guest_count: number;
    category: string; total_amount_kobo: number; extras_kobo: number; discount_kobo: number; paid: number;
  }>(
    db,
    `SELECT r.id, r.reference, r.public_token, r.status, r.check_in, r.check_out, r.nights, r.guest_count, c.name AS category,
            r.total_amount_kobo, r.extras_kobo, r.discount_kobo,
            (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
               FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful') AS paid
     FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id
     WHERE g.email = ? AND r.status IN ('pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled')
     ORDER BY r.check_in DESC LIMIT 50`,
    email.trim().toLowerCase(),
  );
  const rule = await cancelRule(db);
  return rows.map((r) => {
    const upcoming = (r.status === "pending_payment" || r.status === "confirmed") && Date.parse(hotelInstant(r.check_in, rule.checkInTime)) > Date.now();
    return {
      id: r.id, reference: r.reference, token: r.public_token, status: r.status, checkIn: r.check_in, checkOut: r.check_out,
      nights: r.nights ?? 0, guests: r.guest_count, category: r.category, dueKobo: r.total_amount_kobo + r.extras_kobo - r.discount_kobo, paidKobo: r.paid,
      canCancel: upcoming, canChange: upcoming,
      feeIfCancelledKobo: r.status === "confirmed" ? cancellationFee(r.total_amount_kobo, r.check_in, rule) : 0,
    };
  });
}

type Rule = { checkInTime: string; freeHours: number; feePct: number };

async function cancelRule(db: Db): Promise<Rule> {
  const s = await first<{ check_in_time: string; free_cancel_hours: number; late_cancel_fee_pct: number }>(
    db,
    "SELECT check_in_time, free_cancel_hours, late_cancel_fee_pct FROM hotel_settings WHERE id = 1",
  );
  return { checkInTime: s?.check_in_time ?? "14:00", freeHours: s?.free_cancel_hours ?? 48, feePct: s?.late_cancel_fee_pct ?? 50 };
}

/** The fee kept when cancelling now: none more than `freeHours` before check-in, else `feePct`% of the room price. */
export function cancellationFee(roomTotalKobo: number, checkIn: string, rule: Rule, at = Date.now()): number {
  const hoursBefore = (Date.parse(hotelInstant(checkIn, rule.checkInTime)) - at) / 3_600_000;
  return hoursBefore > rule.freeHours ? 0 : Math.round((roomTotalKobo * rule.feePct) / 100);
}

async function ownBooking(db: Db, email: string, reservationId: string) {
  const res = await loadReservation(db, reservationId);
  const owner = await first<{ email: string | null }>(db, "SELECT email FROM guests WHERE id = ?", res.guest_id);
  // Same message whether it doesn't exist or isn't theirs.
  if (!owner?.email || owner.email.toLowerCase() !== email.trim().toLowerCase()) throw new AppError("NOT_FOUND", "Booking not found.");
  return res;
}

/** Guest cancels online. Unpaid holds just end; paid bookings keep the fee and flag the refund for a manager. */
export async function guestCancel(db: Db, email: string, reservationId: string): Promise<{ feeKobo: number; refundKobo: number }> {
  return retryOnStale(async () => {
    const res = await ownBooking(db, email, reservationId);
    const rule = await cancelRule(db);
    if (!(res.status === "pending_payment" || res.status === "confirmed") || Date.parse(hotelInstant(res.check_in, rule.checkInTime)) <= Date.now()) {
      throw new AppError("INVALID_TRANSITION", "This booking can't be cancelled online. Please contact the hotel.");
    }
    const paid = await netPaid(db, res.id);
    const fee = paid > 0 ? Math.min(paid, cancellationFee(res.total_amount_kobo, res.check_in, rule)) : 0;
    const refund = Math.max(0, paid - fee);
    const naira = formatNaira;
    const stmts = [
      assertVersion(db, "reservations", res.id, res.version),
      db
        .prepare("UPDATE reservations SET status = 'cancelled', cancellation_reason = 'Cancelled by the guest online', cancellation_fee_kobo = ? WHERE id = ?")
        .bind(fee, res.id),
      activity(db, "reservation.cancelled_by_guest", "reservation", res.id, `${res.reference} cancelled by the guest online${paid ? `: fee ${naira(fee)}, refund ${naira(refund)}` : ""}`, {
        paid_kobo: paid, fee_kobo: fee, refund_kobo: refund,
      }),
    ];
    if (refund > 0) {
      stmts.push(
        db
          .prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?")
          .bind(`Guest cancelled online. Refund ${naira(refund)} (fee kept: ${naira(fee)}).`, res.id),
      );
    }
    await writeBatch(db, null, stmts, "Cancelled by the guest online");
    return { feeKobo: fee, refundKobo: refund };
  });
}

/** Guest changes dates online (same room type, if free). Any difference is flagged for the front desk. */
export async function guestChangeDates(db: Db, email: string, reservationId: string, checkIn: string, checkOut: string): Promise<void> {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new AppError("VALIDATION", "Choose your new dates.");
  const res = await ownBooking(db, email, reservationId);
  const rule = await cancelRule(db);
  if (!(res.status === "pending_payment" || res.status === "confirmed") || Date.parse(hotelInstant(res.check_in, rule.checkInTime)) <= Date.now()) {
    throw new AppError("INVALID_TRANSITION", "This booking can't be changed online. Please contact the hotel.");
  }
  await changeDates(db, null, res.id, checkIn, checkOut, true);
}

