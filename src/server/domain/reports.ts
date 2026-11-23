import { addDays, hotelToday } from "@/lib/hotel-date";
import { FINANCE, all, first, requireRole, type Actor, type Db } from "../db";

export type ReportRange = "today" | "14d" | "month" | `${number}-${number}`;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const FIRST_MONTH = "2026-11";

export function reportRange(range: string | undefined, today = hotelToday()): ReportRange {
  if (range === "today" || range === "month") return range;
  if (range && MONTH.test(range) && range >= FIRST_MONTH && range <= today.slice(0, 7)) return range === today.slice(0, 7) ? "month" : (range as ReportRange);
  return "14d";
}

export function rangeDates(range: ReportRange, today: string): { from: string; to: string; days: string[] } {
  let from = today;
  let to = today;
  if (range === "14d") from = addDays(today, -13);
  else if (range === "month") from = `${today.slice(0, 7)}-01`;
  else if (range !== "today") {
    from = `${range}-01`;
    const last = addDays(`${addDays(from, 31).slice(0, 7)}-01`, -1);
    to = last < today ? last : today;
  }
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return { from, to, days };
}

export function recentMonths(today: string, count = 12): string[] {
  const out: string[] = [];
  for (let m = today.slice(0, 7), i = 0; i < count && m >= FIRST_MONTH; i++) {
    out.push(m);
    m = addDays(`${m}-01`, -1).slice(0, 7);
  }
  return out;
}

export type Bucket = "cash" | "transfer" | "pos" | "cardOnline" | "other";
export type Department = "rooms" | "restaurantBar" | "hall";

export type IncomeRow = {
  department: Department; at: string; day: string; reference: string; detail: string; method: Bucket;
  kobo: number; takenBy: string; staffId: string | null; document: string | null; correction: boolean;
};

const bucket = (col: string, provider = "NULL") => `CASE WHEN ${provider} = 'paystack' THEN 'cardOnline' WHEN ${col} = 'cash' THEN 'cash'
  WHEN ${col} = 'bank_transfer' THEN 'transfer' WHEN ${col} IN ('pos_terminal', 'card') THEN 'pos' ELSE 'other' END`;

export async function incomeRows(db: Db, actor: Actor, range: ReportRange, today = hotelToday()): Promise<IncomeRow[]> {
  requireRole(actor, FINANCE);
  const { from, to } = rangeDates(range, today);
  const rows = await all<Omit<IncomeRow, "correction"> & { correction: number }>(
    db,
    `SELECT 'rooms' AS department, p.paid_at AS at, date(p.paid_at, '+1 hour') AS day, r.reference, g.full_name AS detail,
            ${bucket("p.method", "p.provider")} AS method,
            CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END AS kobo,
            CASE WHEN p.provider = 'paystack' THEN 'Website' ELSE coalesce(s.full_name, 'Staff') END AS takenBy,
            CASE WHEN p.provider = 'paystack' THEN NULL ELSE p.recorded_by END AS staffId,
            p.receipt_number AS document, p.kind <> 'payment' AS correction
     FROM payments p JOIN reservations r ON r.id = p.reservation_id JOIN guests g ON g.id = r.guest_id
     LEFT JOIN staff_profiles s ON s.id = p.recorded_by
     WHERE p.status = 'successful' AND date(p.paid_at, '+1 hour') BETWEEN ?1 AND ?2
     UNION ALL
     SELECT 'restaurantBar', coalesce(sa.settled_at, sa.created_at), date(coalesce(sa.settled_at, sa.created_at), '+1 hour'),
            'Sale ' || sa.number,
            (CASE sa.outlet WHEN 'bar' THEN 'Bar' ELSE 'Restaurant' END) || CASE WHEN r.reference IS NULL THEN '' ELSE ' · charged to ' || r.reference END,
            ${bucket("sa.method")}, sa.total_kobo, coalesce(s.full_name, 'Staff'), coalesce(sa.settled_by, sa.sold_by), CAST(sa.number AS TEXT), 0
     FROM sales sa LEFT JOIN reservations r ON r.id = sa.reservation_id LEFT JOIN staff_profiles s ON s.id = coalesce(sa.settled_by, sa.sold_by)
     WHERE sa.status IN ('paid', 'settled') AND date(coalesce(sa.settled_at, sa.created_at), '+1 hour') BETWEEN ?1 AND ?2
     UNION ALL
     SELECT 'hall', hp.created_at, hp.paid_on, h.title, h.customer_name, ${bucket("hp.method")}, hp.amount_kobo,
            coalesce(s.full_name, 'Staff'), hp.recorded_by, hp.reference, 0
     FROM hall_payments hp JOIN hall_bookings h ON h.id = hp.booking_id LEFT JOIN staff_profiles s ON s.id = hp.recorded_by
     WHERE hp.paid_on BETWEEN ?1 AND ?2
     ORDER BY day, at`,
    from,
    to,
  );
  return rows.map((r) => ({ ...r, correction: !!r.correction }));
}

export type DayIncome = { day: string } & Record<Department, number> & { total: number };
export type StaffTakings = { who: string; staffId: string | null; byMethod: Record<Bucket, number>; total: number };

export async function incomeReport(db: Db, actor: Actor, range: ReportRange, today = hotelToday()) {
  const { from, to, days } = rangeDates(range, today);
  const rows = await incomeRows(db, actor, range, today);
  const daily = new Map<string, DayIncome>(days.map((day) => [day, { day, rooms: 0, restaurantBar: 0, hall: 0, total: 0 }]));
  const staff = new Map<string, StaffTakings>();
  for (const r of rows) {
    const d = daily.get(r.day);
    if (d) {
      d[r.department] += r.kobo;
      d.total += r.kobo;
    }
    const key = r.staffId ?? r.takenBy;
    const t = staff.get(key) ?? { who: r.takenBy, staffId: r.staffId, byMethod: { cash: 0, transfer: 0, pos: 0, cardOnline: 0, other: 0 }, total: 0 };
    t.byMethod[r.method] += r.kobo;
    t.total += r.kobo;
    staff.set(key, t);
  }
  const list = [...daily.values()];
  return { from, to, rows, daily: list, total: list.reduce((s, d) => s + d.total, 0), byStaff: [...staff.values()].sort((a, b) => b.total - a.total) };
}

const STAYING = "r.status IN ('confirmed', 'checked_in', 'checked_out')";
const STAY_END =
  "(CASE WHEN r.status = 'checked_out' AND r.checked_out_at IS NOT NULL THEN min(r.check_out, max(date(r.check_in, '+1 day'), date(r.checked_out_at, '+1 hour'))) ELSE r.check_out END)";

export async function occupancyReport(db: Db, actor: Actor, range: ReportRange, today = hotelToday()) {
  requireRole(actor, FINANCE);
  const { from, to } = rangeDates(range, today);
  const [rooms, nights, byType] = await Promise.all([
    first<{ n: number }>(db, "SELECT count(*) AS n FROM rooms WHERE is_active = 1"),
    all<{ day: string; occupied: number }>(
      db,
      `SELECT cal.d AS day, (SELECT count(*) FROM reservations r WHERE ${STAYING} AND r.check_in <= cal.d AND ${STAY_END} > cal.d) AS occupied
       FROM calendar cal WHERE cal.d BETWEEN ? AND ? ORDER BY cal.d`,
      from,
      to,
    ),
    all<{ name: string; nights: number }>(
      db,
      `SELECT c.name, count(*) AS nights
       FROM calendar cal
       JOIN reservations r ON r.check_in <= cal.d AND ${STAY_END} > cal.d AND ${STAYING}
       LEFT JOIN rooms rm ON rm.id = r.room_id
       JOIN room_categories c ON c.id = coalesce(rm.category_id, r.category_id)
       WHERE cal.d BETWEEN ? AND ?
       GROUP BY c.id ORDER BY c.sort_order, c.name`,
      from,
      to,
    ),
  ]);
  const inService = rooms?.n ?? 0;
  const pct = (occupied: number) => (inService ? Math.min(100, Math.round((occupied / inService) * 100)) : 0);
  const sold = nights.reduce((s, n) => s + n.occupied, 0);
  return {
    from,
    to,
    roomsInService: inService,
    nights: nights.map((n) => ({ day: n.day, occupied: n.occupied, pct: pct(n.occupied) })),
    averagePct: nights.length && inService ? Math.min(100, Math.round((sold / (nights.length * inService)) * 100)) : 0,
    byType,
  };
}

export function csvField(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  let s = value ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
