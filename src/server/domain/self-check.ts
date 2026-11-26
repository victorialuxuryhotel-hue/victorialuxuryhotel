// The self-check (rules-and-edge-cases.md section 4). Runs with the scheduled job: the urgent checks
// every 10 minutes, the rest once a day after the 06:00 business-day cut-off. It never changes money
// or bookings; it only reports. Each problem alerts at most once a day (self_check_state), and the
// Dashboard shows the current list live ("Anything wrong?").
//
// Not covered yet (need data the app doesn't have): Paystack's own transaction list (daily reconcile)
// and refund outcomes (no refund workflow yet).

import { formatNaira } from "@/lib/format";
import { businessDate, hotelToday } from "@/lib/hotel-date";
import { all, first, type Db } from "../db";
import { stayEndSql } from "./inventory";
import { MISMATCH_FLAG } from "./payments";

export type Finding = { key: string; check: string; urgent: boolean; message: string };

const PAID = `(SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
  FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful')`;
const DUE = "(r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo)";
const GUEST = "JOIN guests g ON g.id = r.guest_id LEFT JOIN rooms rm ON rm.id = r.room_id";
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
const room = (n: string | null) => (n ? `Room ${n}` : "no room");

/** Every 10 minutes: things that need someone now. */
export async function urgentChecks(db: Db): Promise<Finding[]> {
  const [owes, pending, noRoom, overpaid, doubleRoom, heldWithRoom] = await Promise.all([
    all<{ id: string; reference: string; name: string; room: string | null; owed: number }>(
      db,
      `SELECT r.id, r.reference, g.full_name AS name, rm.room_number AS room, ${DUE} - ${PAID} AS owed
       FROM reservations r ${GUEST} WHERE r.status = 'checked_in' AND ${DUE} - ${PAID} > 0`,
    ),
    all<{ reference: string; minutes: number }>(
      db,
      `SELECT r.reference, CAST((julianday('now') - julianday(p.created_at)) * 1440 AS INTEGER) AS minutes
       FROM payments p JOIN reservations r ON r.id = p.reservation_id
       WHERE p.provider = 'paystack' AND p.status = 'pending' AND p.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 minutes')
         AND p.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')
         AND coalesce(p.gateway_response, '') NOT LIKE '${MISMATCH_FLAG}%'`,
    ),
    all<{ reference: string; paid: number; type: string }>(
      db,
      `SELECT r.reference, ${PAID} AS paid, c.name AS type FROM reservations r JOIN room_categories c ON c.id = r.category_id
       WHERE r.status = 'confirmed' AND r.room_id IS NULL AND ${PAID} >= ${DUE} AND r.check_out > ?`,
      hotelToday(),
    ),
    all<{ reference: string; over: number }>(
      db,
      `SELECT r.reference, ${PAID} - ${DUE} AS over FROM reservations r
       WHERE r.status IN ('confirmed', 'checked_in', 'checked_out') AND ${PAID} > ${DUE} AND r.attention_reason IS NULL`,
    ),
    all<{ room: string; n: number }>(
      db,
      `SELECT rm.room_number AS room, count(*) AS n FROM reservations r JOIN rooms rm ON rm.id = r.room_id
       WHERE r.status = 'checked_in' GROUP BY r.room_id HAVING count(*) > 1`,
    ),
    all<{ reference: string }>(db, "SELECT reference FROM reservations WHERE status = 'pending_payment' AND room_id IS NOT NULL"),
  ]);
  return [
    ...owes.map((o) => ({ key: `owes:${o.id}`, check: "in_house_owes", urgent: true, message: `${o.name} (${room(o.room)}) is in house and owes ${formatNaira(o.owed)}.` })),
    ...pending.map((p) => ({ key: `pending:${p.reference}`, check: "online_payment_pending", urgent: true, message: `Online payment for ${p.reference} has been pending for ${Math.round(p.minutes / 60) || 1} hour(s). Check Paystack.` })),
    ...noRoom.map((n) => ({ key: `noroom:${n.reference}`, check: "paid_no_room", urgent: true, message: `${n.reference} paid ${formatNaira(n.paid)} but has no ${n.type} room. Assign one or call the guest.` })),
    ...overpaid.map((o) => ({ key: `overpaid:${o.reference}`, check: "overpaid", urgent: true, message: `${o.reference} has been paid ${formatNaira(o.over)} more than it costs. Raise a refund.` })),
    ...doubleRoom.map((d) => ({ key: `double:${d.room}`, check: "invariant_two_in_room", urgent: true, message: `Data check failed: ${d.n} guests are checked in to Room ${d.room}.` })),
    ...heldWithRoom.map((h) => ({ key: `heldroom:${h.reference}`, check: "invariant_unpaid_with_room", urgent: true, message: `Data check failed: ${h.reference} is unpaid but has a room.` })),
  ];
}

/** Once a day after 06:00: things to sort out today. */
export async function dailyChecks(db: Db): Promise<Finding[]> {
  const today = hotelToday();
  const [overdue, notArrived, closings, maintenance, unconfirmed] = await Promise.all([
    all<{ id: string; name: string; room: string | null; check_out: string }>(
      db,
      `SELECT r.id, g.full_name AS name, rm.room_number AS room, r.check_out FROM reservations r ${GUEST}
       WHERE r.status = 'checked_in' AND r.check_out < ?`,
      today,
    ),
    all<{ id: string; name: string; check_in: string }>(
      db,
      `SELECT r.id, g.full_name AS name, r.check_in FROM reservations r ${GUEST}
       WHERE r.status = 'confirmed' AND r.check_in < ? AND ${stayEndSql("r")} > ?`,
      businessDate(),
      today,
    ),
    all<{ id: string; who: string; business_date: string }>(
      db,
      `SELECT c.id, coalesce(s.full_name, 'A salesperson') AS who, c.business_date FROM pos_closings c LEFT JOIN staff_profiles s ON s.id = c.staff_id
       WHERE c.verified_at IS NULL AND c.closed_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')`,
    ),
    all<{ room: string; since: string }>(
      db,
      `SELECT room_number AS room, updated_at AS since FROM rooms
       WHERE is_active = 1 AND service_status <> 'in_service' AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')`,
    ),
    first<{ n: number; kobo: number }>(
      db,
      `SELECT count(*) AS n, coalesce(sum(p.amount_kobo), 0) AS kobo FROM payments p
       WHERE p.provider = 'offline' AND p.kind = 'payment' AND p.status = 'successful' AND p.method IN ('bank_transfer', 'pos_terminal')
         AND p.paid_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')
         AND NOT EXISTS (SELECT 1 FROM payment_checks c WHERE c.source_type = 'payment' AND c.source_id = p.id)`,
    ),
  ]);
  return [
    ...overdue.map((o) => ({ key: `overdue:${o.id}`, check: "overdue_checkout", urgent: false, message: `${o.name} should have left ${room(o.room)} on ${day(o.check_out)}.` })),
    ...notArrived.map((n) => ({ key: `noshow:${n.id}`, check: "not_arrived", urgent: false, message: `${n.name} was due ${day(n.check_in)} and hasn't arrived.` })),
    ...closings.map((c) => ({ key: `closing:${c.id}`, check: "closing_unverified", urgent: false, message: `${c.who}'s closing for ${day(c.business_date)} is waiting for sign-off.` })),
    ...maintenance.map((m) => ({ key: `maint:${m.room}`, check: "room_out_of_order", urgent: false, message: `Room ${m.room} has been out of order since ${day(m.since.slice(0, 10))}.` })),
    ...(unconfirmed && unconfirmed.n > 0
      ? [{ key: "unconfirmed-payments", check: "payments_to_confirm", urgent: false, message: `${unconfirmed.n} transfer/POS payment(s) (${formatNaira(unconfirmed.kobo)}) older than 3 days are still to confirm against the bank.` }]
      : []),
  ];
}

/** Both lists, for the Dashboard. */
export async function currentFindings(db: Db): Promise<Finding[]> {
  const [u, d] = await Promise.all([urgentChecks(db), dailyChecks(db)]);
  return [...u, ...d];
}

const DAILY_KEY = "_daily_run";
const RESEND_AFTER_HOURS = 24;

/**
 * For the scheduled job: the findings that should be alerted now. Urgent checks every run; daily
 * checks on the first run after 06:00 (business day). Each finding at most once a day.
 */
export async function findingsToAlert(db: Db, at: Date = new Date()): Promise<Finding[]> {
  const lastDaily = await first<{ sent_at: string }>(db, "SELECT sent_at FROM self_check_state WHERE key = ?", DAILY_KEY);
  const dailyDue = !lastDaily || businessDate(new Date(lastDaily.sent_at)) < businessDate(at);
  const findings = [...(await urgentChecks(db)), ...(dailyDue ? await dailyChecks(db) : [])];
  const recent = new Set(
    (await all<{ key: string }>(db, "SELECT key FROM self_check_state WHERE sent_at > ?", new Date(at.getTime() - RESEND_AFTER_HOURS * 3_600_000).toISOString())).map((r) => r.key),
  );
  const fresh = findings.filter((f) => !recent.has(f.key));
  const stamp = at.toISOString();
  const marks = [...fresh.map((f) => f.key), ...(dailyDue ? [DAILY_KEY] : [])];
  if (marks.length) {
    await db.batch(marks.map((k) => db.prepare("INSERT INTO self_check_state (key, sent_at) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET sent_at = excluded.sent_at").bind(k, stamp)));
  }
  // Forget resolved problems after a week, so the table stays small.
  await db.prepare("DELETE FROM self_check_state WHERE key <> ? AND sent_at < ?").bind(DAILY_KEY, new Date(at.getTime() - 7 * 86_400_000).toISOString()).run();
  return fresh;
}
