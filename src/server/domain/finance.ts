import { businessDaySql, hotelToday } from "@/lib/hotel-date";
import { vatIncluded } from "@/lib/vat";
import { all, first, HOTEL_REPORTERS, requireRole, type Actor, type Db } from "../db";
import { rangeDates, type ReportRange } from "./reports";

export { vatIncluded };

export const DEPARTMENT_LABELS = { rooms: "Hotel rooms", restaurant: "Restaurant", bar: "Bar", hall: "Conference hall" } as const;
export type DepartmentKey = keyof typeof DEPARTMENT_LABELS;

/** Money received by each department in the period (sales and payments only; no expenses), and the VAT included in it. */
export async function financeSummary(db: Db, actor: Actor, range: ReportRange, today = hotelToday()) {
  requireRole(actor, HOTEL_REPORTERS);
  const { from, to } = rangeDates(range, today);
  const hotelOnly = actor.role === "hotel_manager";
  const [rooms, sales, halls, settings] = await Promise.all([
    first<{ kobo: number }>(
      db,
      `SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_kobo ELSE -amount_kobo END), 0) AS kobo FROM payments
       WHERE status = 'successful' AND date(paid_at, '+1 hour') BETWEEN ? AND ?`,
      from, to,
    ),
    all<{ outlet: "restaurant" | "bar"; kobo: number }>(
      db,
      `SELECT outlet, sum(total_kobo) AS kobo FROM pos_orders WHERE status = 'paid' AND ${businessDaySql("paid_at")} BETWEEN ? AND ? GROUP BY outlet`,
      from, to,
    ),
    first<{ kobo: number }>(db, "SELECT coalesce(sum(amount_kobo), 0) AS kobo FROM hall_payments WHERE paid_on BETWEEN ? AND ?", from, to),
    first<{ vat_rate_bp: number }>(db, "SELECT vat_rate_bp FROM hotel_settings WHERE id = 1"),
  ]);
  const outletKobo = (o: "restaurant" | "bar") => sales.find((x) => x.outlet === o)?.kobo ?? 0;
  const income = hotelOnly
    ? { rooms: rooms?.kobo ?? 0, restaurant: 0, bar: 0, hall: 0 }
    : { rooms: rooms?.kobo ?? 0, restaurant: outletKobo("restaurant"), bar: outletKobo("bar"), hall: halls?.kobo ?? 0 };
  const incomeTotal = income.rooms + income.restaurant + income.bar + income.hall;
  const rate = settings?.vat_rate_bp ?? 750;
  const departments = (Object.keys(DEPARTMENT_LABELS) as DepartmentKey[]).filter((k) => !hotelOnly || k === "rooms").map((key) => ({
    key, label: DEPARTMENT_LABELS[key], incomeKobo: income[key], vatKobo: vatIncluded(income[key], rate),
  }));
  return { from, to, income, incomeTotal, vatRateBp: rate, vatKobo: vatIncluded(incomeTotal, rate), departments };
}
