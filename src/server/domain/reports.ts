import { addDays, businessDaySql, hotelToday, isIsoDate, nightsBetween } from "@/lib/hotel-date";
import { HOTEL_REPORTERS, all, first, requireRole, type Actor, type Db } from "../db";

/**
 * A report period: a fixed one, a past month ("2026-10"), or dates someone picked ("2026-11-02_2026-11-20",
 * both days included). It stays one string so it travels in a single `range` query param.
 */
export type ReportRange = "today" | "week" | "7d" | "14d" | "month" | `${number}-${number}` | `${string}_${string}`;

const FIXED_RANGE_LABEL = { today: "Today", week: "This week", "7d": "7 days", "14d": "14 days", month: "This month" } as const;

const shortDate = (d: string, year: boolean) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** A label for any range reportRange() can return: a fixed period, a past month ("October 2026") or picked dates ("2 Nov – 20 Nov 2026"). */
export function rangeLabel(range: ReportRange): string {
  if (range in FIXED_RANGE_LABEL) return FIXED_RANGE_LABEL[range as keyof typeof FIXED_RANGE_LABEL];
  const picked = pickedDates(range);
  if (picked) {
    if (picked.from === picked.to) return shortDate(picked.from, true);
    return `${shortDate(picked.from, picked.from.slice(0, 4) !== picked.to.slice(0, 4))} – ${shortDate(picked.to, true)}`;
  }
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range}-01T00:00:00Z`));
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const FIRST_MONTH = "2026-11";
/** The longest period that can be picked, in days (both ends counted). */
export const MAX_PICKED_DAYS = 92;

/** The from and to of a picked range ("2026-11-02_2026-11-20"), or null for any other range. */
export function pickedDates(range: string): { from: string; to: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(range);
  return m ? { from: m[1]!, to: m[2]! } : null;
}

/** Why picked dates can't be used, or null when they can: real dates, from ≤ to ≤ today, at most MAX_PICKED_DAYS days. */
export function pickedRangeError(from: string | undefined, to: string | undefined, today = hotelToday()): string | null {
  if (!from || !to) return "Choose both dates.";
  if (!isIsoDate(from) || !isIsoDate(to)) return "Those aren't valid dates.";
  if (from > to) return "The first date must be on or before the second.";
  if (to > today) return "Reports can't run past today.";
  if (nightsBetween(from, to) + 1 > MAX_PICKED_DAYS) return `Pick at most ${MAX_PICKED_DAYS} days.`;
  return null;
}

/** The period from a query string; anything that doesn't validate falls back to 14 days. */
export function reportRange(range: string | undefined, today = hotelToday()): ReportRange {
  if (range === "today" || range === "month" || range === "7d" || range === "week") return range;
  if (range && MONTH.test(range) && range >= FIRST_MONTH && range <= today.slice(0, 7)) return range === today.slice(0, 7) ? "month" : (range as ReportRange);
  const picked = range ? pickedDates(range) : null;
  if (picked && !pickedRangeError(picked.from, picked.to, today)) return `${picked.from}_${picked.to}`;
  return "14d";
}

/** Monday of the week holding `date` (weeks run Monday to Sunday). */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export function rangeDates(range: ReportRange, today: string): { from: string; to: string; days: string[] } {
  let from = today;
  let to = today;
  const picked = pickedDates(range);
  if (range === "14d") from = addDays(today, -13);
  else if (range === "7d") from = addDays(today, -6);
  else if (range === "week") from = mondayOf(today);
  else if (range === "month") from = `${today.slice(0, 7)}-01`;
  else if (picked) ({ from, to } = picked);
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
export type Department = "rooms" | "restaurant" | "bar" | "hall";

export type IncomeRow = {
  department: Department; at: string; day: string; reference: string; detail: string; method: Bucket;
  kobo: number; takenBy: string; staffId: string | null; document: string | null; correction: boolean;
};

const bucket = (col: string, provider = "NULL") => `CASE WHEN ${provider} = 'paystack' THEN 'cardOnline' WHEN ${col} = 'cash' THEN 'cash'
  WHEN ${col} = 'bank_transfer' THEN 'transfer' WHEN ${col} IN ('pos_terminal', 'card') THEN 'pos' ELSE 'other' END`;

export async function incomeRows(db: Db, actor: Actor, range: ReportRange, today = hotelToday()): Promise<IncomeRow[]> {
  requireRole(actor, HOTEL_REPORTERS);
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
     SELECT o.outlet, o.paid_at, ${businessDaySql("o.paid_at")}, 'Order ' || o.number,
            (CASE o.outlet WHEN 'bar' THEN 'Bar' ELSE 'Restaurant' END) || ' · ' || o.receipt_number,
            ${bucket("o.method")}, o.total_kobo, coalesce(s.full_name, 'Staff'), o.paid_by, o.receipt_number, 0
     FROM pos_orders o LEFT JOIN staff_profiles s ON s.id = o.paid_by
     WHERE o.status = 'paid' AND ${businessDaySql("o.paid_at")} BETWEEN ?1 AND ?2
     UNION ALL
     SELECT 'hall', hp.created_at, hp.paid_on, h.title, h.customer_name, ${bucket("hp.method")}, hp.amount_kobo,
            coalesce(s.full_name, 'Staff'), hp.recorded_by, hp.reference, 0
     FROM hall_payments hp JOIN hall_bookings h ON h.id = hp.booking_id LEFT JOIN staff_profiles s ON s.id = hp.recorded_by
     WHERE hp.paid_on BETWEEN ?1 AND ?2
     ORDER BY day, at`,
    from,
    to,
  );
  return rows.map((r) => ({ ...r, correction: !!r.correction })).filter((r) => actor.role !== "hotel_manager" || r.department === "rooms");
}

export type DayIncome = { day: string } & Record<Department, number> & { total: number };
export type StaffTakings = { who: string; staffId: string | null; byMethod: Record<Bucket, number>; total: number };

export function reportDepartment(value: string | null | undefined): Department | null {
  return value === "rooms" || value === "restaurant" || value === "bar" || value === "hall" ? value : null;
}

export async function incomeReport(db: Db, actor: Actor, range: ReportRange, today = hotelToday(), department: Department | null = null) {
  const { from, to, days } = rangeDates(range, today);
  const rows = (await incomeRows(db, actor, range, today)).filter((r) => !department || r.department === department);
  const daily = new Map<string, DayIncome>(days.map((day) => [day, { day, rooms: 0, restaurant: 0, bar: 0, hall: 0, total: 0 }]));
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
  requireRole(actor, HOTEL_REPORTERS);
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
  const revenue = await roomRevenue(db, from, to);
  const available = nights.length * inService;
  return {
    from,
    to,
    roomsInService: inService,
    nights: nights.map((n) => ({ day: n.day, occupied: n.occupied, pct: pct(n.occupied) })),
    averagePct: nights.length && inService ? Math.min(100, Math.round((sold / (nights.length * inService)) * 100)) : 0,
    byType,
    soldNights: sold,
    availableNights: available,
    /** Room revenue earned by the nights stayed in the period (not money received). */
    roomRevenueKobo: revenue.kobo,
    /** Average daily rate: room revenue ÷ room-nights sold. */
    adrKobo: revenue.nights ? Math.round(revenue.kobo / revenue.nights) : 0,
    /** Revenue per available room: room revenue ÷ (rooms in service × nights in the period). */
    revparKobo: available ? Math.round(revenue.kobo / available) : 0,
  };
}

/**
 * Room revenue earned from stays between `from` and `to` (both nights included): for each staying booking, its
 * booked nightly rate × the nights of the stay that fall in the period (STAY_END, as occupancy counts them), less
 * that share of its discount (the discount spread evenly over the booked nights). Money received is a different
 * figure: it includes advance payments for later stays and leaves out what is still owed.
 */
export async function roomRevenue(db: Db, from: string, to: string): Promise<{ kobo: number; nights: number }> {
  const rows = await all<{ rate: number; discount: number; booked: number; n: number }>(
    db,
    `SELECT r.nightly_rate_kobo AS rate, r.discount_kobo AS discount, r.nights AS booked,
            CAST(julianday(min(${STAY_END}, date(?2, '+1 day'))) - julianday(max(r.check_in, ?1)) AS INTEGER) AS n
     FROM reservations r
     WHERE ${STAYING} AND r.check_in <= ?2 AND ${STAY_END} > ?1`,
    from,
    to,
  );
  let kobo = 0;
  let nights = 0;
  for (const r of rows) {
    if (r.n <= 0) continue;
    kobo += r.rate * r.n - Math.round((r.discount * r.n) / r.booked);
    nights += r.n;
  }
  return { kobo, nights };
}

export function csvField(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  let s = value ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
