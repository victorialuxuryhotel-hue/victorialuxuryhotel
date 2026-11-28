import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { hashCode } from "@/lib/guest-token";
import { hotelInstant, isIsoDate } from "@/lib/hotel-date";
import { activity, all, assertVersion, first, now, retryOnStale, writeBatch, type Db } from "../db";
import { cancellationFee, cancelRule } from "./cancellation-rule";
import { changeDates, loadReservation, netPaid } from "./reservations";

export { cancellationFee };

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

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

export async function checkGuestCode(db: Db, email: string, code: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const row = await db
    .prepare(
      `UPDATE guest_login_codes SET attempts = attempts + 1
       WHERE id = (SELECT id FROM guest_login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1)
         AND attempts < ?
       RETURNING id, code_hash`,
    )
    .bind(e, now(), MAX_ATTEMPTS)
    .first<{ id: number; code_hash: string }>();
  if (!row || row.code_hash !== (await hashCode(e, code.trim()))) return false;
  const used = await db.prepare("UPDATE guest_login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now(), row.id).run();
  return used.meta.changes === 1;
}

export type GuestBooking = {
  id: string; reference: string; token: string; status: string; checkIn: string; checkOut: string; nights: number; guests: number;
  category: string; dueKobo: number; paidKobo: number; canCancel: boolean; canChange: boolean; feeIfCancelledKobo: number;
  /** For the guest's bookings page (design G9): the room type's photo, how long an unpaid booking is held, and its receipt. */
  categorySlug: string; holdExpiresAt: string | null; receipt: string | null;
};

export async function guestBookings(db: Db, email: string): Promise<GuestBooking[]> {
  const rows = await all<{
    id: string; reference: string; public_token: string; status: string; check_in: string; check_out: string; nights: number; guest_count: number;
    category: string; total_amount_kobo: number; extras_kobo: number; room_change_kobo: number; discount_kobo: number; paid: number;
    category_slug: string; hold_expires_at: string | null; receipt: string | null;
  }>(
    db,
    `SELECT r.id, r.reference, r.public_token, r.status, r.check_in, r.check_out, r.nights, r.guest_count, c.name AS category,
            r.total_amount_kobo, r.extras_kobo, r.room_change_kobo, r.discount_kobo,
            (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
               FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful') AS paid,
            c.slug AS category_slug, r.hold_expires_at,
            (SELECT p.receipt_number FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful' AND p.kind = 'payment'
               AND p.receipt_number IS NOT NULL ORDER BY p.created_at LIMIT 1) AS receipt
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
      nights: r.nights ?? 0, guests: r.guest_count, category: r.category, dueKobo: r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo, paidKobo: r.paid,
      canCancel: upcoming,
      canChange: upcoming && !(r.paid > 0 && cancellationFee(r.total_amount_kobo, r.check_in, rule) > 0),
      feeIfCancelledKobo: r.status === "confirmed" ? cancellationFee(r.total_amount_kobo, r.check_in, rule) : 0,
      categorySlug: r.category_slug, holdExpiresAt: r.hold_expires_at, receipt: r.receipt,
    };
  });
}


async function ownBooking(db: Db, email: string, reservationId: string) {
  const res = await loadReservation(db, reservationId);
  const owner = await first<{ email: string | null }>(db, "SELECT email FROM guests WHERE id = ?", res.guest_id);
  if (!owner?.email || owner.email.toLowerCase() !== email.trim().toLowerCase()) throw new AppError("NOT_FOUND", "Booking not found.");
  return res;
}

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

export async function guestChangeDates(db: Db, email: string, reservationId: string, checkIn: string, checkOut: string): Promise<void> {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new AppError("VALIDATION", "Choose your new dates.");
  const res = await ownBooking(db, email, reservationId);
  const rule = await cancelRule(db);
  if (!(res.status === "pending_payment" || res.status === "confirmed") || Date.parse(hotelInstant(res.check_in, rule.checkInTime)) <= Date.now()) {
    throw new AppError("INVALID_TRANSITION", "This booking can't be changed online. Please contact the hotel.");
  }
  if (cancellationFee(res.total_amount_kobo, res.check_in, rule) > 0 && (await netPaid(db, res.id)) > 0) {
    throw new AppError("INVALID_TRANSITION", `Changes within ${rule.freeHours} hours of check-in are made by the hotel. Please contact us.`);
  }
  await changeDates(db, null, res.id, checkIn, checkOut, true);
}

