import { addDays, hotelToday } from "@/lib/hotel-date";
import { FINANCE, all, first, requireRole, type Actor, type Db } from "../db";

/**
 * Reports for managers and the owner. Every range is in hotel (Lagos) dates,
 * the same rule as the front-desk payments scope: a payment belongs to the
 * Lagos day it was paid (date(paid_at, '+1 hour'); Lagos is UTC+1 all year).
 * Money is net: successful payments minus corrections and refunds.
 */
export type ReportRange = "today" | "14d" | "month";

export function reportRange(range: string | undefined): ReportRange {
  return range === "today" || range === "month" ? range : "14d";
}

/** Inclusive Lagos dates for a range ending today. */
export function rangeDates(range: ReportRange, today: string): { from: string; to: string; days: string[] } {
  const from = range === "today" ? today : range === "14d" ? addDays(today, -13) : `${today.slice(0, 7)}-01`;
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  return { from, to: today, days };
}

const DAY = "date(p.paid_at, '+1 hour')";
const NET = "CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END";
const BUCKET = `CASE WHEN p.provider = 'paystack' THEN 'cardOnline' WHEN p.method = 'cash' THEN 'cash'
  WHEN p.method = 'bank_transfer' THEN 'transfer' WHEN p.method = 'pos_terminal' THEN 'pos' ELSE 'other' END`;

export type Bucket = "cash" | "transfer" | "cardOnline" | "pos" | "other";

export async function moneyReport(db: Db, actor: Actor, range: ReportRange, today = hotelToday()) {
  requireRole(actor, FINANCE);
  const { from, to, days } = rangeDates(range, today);
  const rows = await all<{ day: string; kobo: number }>(
    db,
    `SELECT ${DAY} AS day, sum(${NET}) AS kobo FROM payments p
     WHERE p.status = 'successful' AND ${DAY} BETWEEN ? AND ? GROUP BY day`,
    from,
    to,
  );
  const byDay = new Map(rows.map((r) => [r.day, r.kobo]));
  const daily = days.map((day) => ({ day, kobo: byDay.get(day) ?? 0 }));
  return { from, to, total: daily.reduce((s, d) => s + d.kobo, 0), daily };
}

export type CashUpRow = { who: string; staffId: string | null; counts: Record<Bucket, number>; totalKobo: number };

/** Who took what on one Lagos day: count of payments by method and the net total, per staff member (or Website). */
export async function cashUp(db: Db, actor: Actor, day = hotelToday()): Promise<CashUpRow[]> {
  requireRole(actor, FINANCE);
  const rows = await all<{ staff_id: string | null; who: string | null; online: number; bucket: Bucket; n: number; kobo: number }>(
    db,
    `SELECT CASE WHEN p.provider = 'paystack' THEN NULL ELSE p.recorded_by END AS staff_id, s.full_name AS who,
            p.provider = 'paystack' AS online, ${BUCKET} AS bucket, count(*) AS n, sum(${NET}) AS kobo
     FROM payments p LEFT JOIN staff_profiles s ON s.id = p.recorded_by
     WHERE p.status = 'successful' AND ${DAY} = ?
     GROUP BY staff_id, online, bucket`,
    day,
  );
  const out = new Map<string, CashUpRow>();
  for (const r of rows) {
    const key = r.online ? "website" : (r.staff_id ?? "unknown");
    const row = out.get(key) ?? {
      who: r.online ? "Website" : (r.who ?? "Staff"),
      staffId: r.online ? null : r.staff_id,
      counts: { cash: 0, transfer: 0, cardOnline: 0, pos: 0, other: 0 },
      totalKobo: 0,
    };
    row.counts[r.bucket] += r.n;
    row.totalKobo += r.kobo;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => b.totalKobo - a.totalKobo);
}

const STAYING = "r.status IN ('confirmed', 'checked_in', 'checked_out')";

/**
 * Nightly occupancy: rooms with a guest (confirmed, in house or completed)
 * against rooms in service today. Room-nights sold by type, by the type of
 * the room actually assigned (upgrades count where the guest slept).
 */
export async function occupancyReport(db: Db, actor: Actor, range: ReportRange, today = hotelToday()) {
  requireRole(actor, FINANCE);
  const { from, to } = rangeDates(range, today);
  const [rooms, nights, byType] = await Promise.all([
    first<{ n: number }>(db, "SELECT count(*) AS n FROM rooms WHERE is_active = 1 AND service_status = 'in_service'"),
    all<{ day: string; occupied: number }>(
      db,
      `SELECT cal.d AS day, (SELECT count(*) FROM reservations r WHERE ${STAYING} AND r.check_in <= cal.d AND r.check_out > cal.d) AS occupied
       FROM calendar cal WHERE cal.d BETWEEN ? AND ? ORDER BY cal.d`,
      from,
      to,
    ),
    all<{ name: string; nights: number }>(
      db,
      `SELECT c.name, count(*) AS nights
       FROM calendar cal
       JOIN reservations r ON r.check_in <= cal.d AND r.check_out > cal.d AND ${STAYING}
       LEFT JOIN rooms rm ON rm.id = r.room_id
       JOIN room_categories c ON c.id = coalesce(rm.category_id, r.category_id)
       WHERE cal.d BETWEEN ? AND ?
       GROUP BY c.id ORDER BY c.sort_order, c.name`,
      from,
      to,
    ),
  ]);
  const inService = rooms?.n ?? 0;
  const pct = (occupied: number) => (inService ? Math.round((occupied / inService) * 100) : 0);
  const sold = nights.reduce((s, n) => s + n.occupied, 0);
  return {
    from,
    to,
    roomsInService: inService,
    nights: nights.map((n) => ({ day: n.day, occupied: n.occupied, pct: pct(n.occupied) })),
    averagePct: nights.length && inService ? Math.round((sold / (nights.length * inService)) * 100) : 0,
    byType,
  };
}

export type PaymentCsvRow = {
  paid_at: string; reference: string; guest: string; method: string | null; provider: string; kind: string;
  amount_kobo: number; receipt_number: string | null; taken_by: string | null;
};

/** Successful payments and corrections in the range, oldest first, for the CSV download. */
export async function paymentsForCsv(db: Db, actor: Actor, range: ReportRange, today = hotelToday()): Promise<PaymentCsvRow[]> {
  requireRole(actor, FINANCE);
  const { from, to } = rangeDates(range, today);
  return all<PaymentCsvRow>(
    db,
    `SELECT p.paid_at, r.reference, g.full_name AS guest, p.method, p.provider, p.kind, p.amount_kobo, p.receipt_number, s.full_name AS taken_by
     FROM payments p JOIN reservations r ON r.id = p.reservation_id JOIN guests g ON g.id = r.guest_id
     LEFT JOIN staff_profiles s ON s.id = p.recorded_by
     WHERE p.status = 'successful' AND ${DAY} BETWEEN ? AND ?
     ORDER BY p.paid_at, p.id`,
    from,
    to,
  );
}

/**
 * One CSV field. Numbers go out as plain numbers. Text is quoted, with a
 * leading quote mark on anything a spreadsheet would run as a formula.
 */
export function csvField(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  let s = value ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
