// The owner's phone dashboard (FUNCTIONALITY.md section 12, design X13): view only.

import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { businessDate, businessDaySql, hotelToday, tonight } from "@/lib/hotel-date";
import { first, type Actor, type Db } from "../db";
import { waitingCount } from "./approvals";
import { incomeReport } from "./reports";
import { currentFindings, forRole } from "./self-check";

export type OwnerSnapshot = {
  today: string;
  occupancy: { sold: number; rooms: number; pct: number };
  takenTodayKobo: number;
  bar: { kobo: number; orders: number };
  overdue: { guests: number; owedKobo: number };
  wrong: { text: string; href: string }[];
  week: { day: string; kobo: number }[];
};

export async function ownerSnapshot(db: Db, actor: Actor): Promise<OwnerSnapshot> {
  if (!actor || actor.role !== "owner") throw new AppError("FORBIDDEN", "This view is for the owner.");
  const today = hotelToday();
  const night = tonight();
  const [rooms, sold, income, bar, overdue, findings, issues, approvals] = await Promise.all([
    first<{ n: number }>(db, "SELECT count(*) AS n FROM rooms WHERE is_active = 1 AND service_status = 'in_service'"),
    first<{ n: number }>(db, "SELECT count(*) AS n FROM reservations WHERE status IN ('confirmed', 'checked_in') AND check_in <= ?1 AND check_out > ?1", night),
    incomeReport(db, actor, "7d", today),
    first<{ kobo: number; n: number }>(
      db,
      `SELECT coalesce(sum(total_kobo), 0) AS kobo, count(*) AS n FROM pos_orders WHERE status = 'paid' AND ${businessDaySql("paid_at")} = ?`,
      businessDate(),
    ),
    first<{ n: number; owed: number }>(
      db,
      `SELECT count(*) AS n, coalesce(sum(r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo
              - (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0) FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful')), 0) AS owed
       FROM reservations r WHERE r.status = 'checked_in' AND r.check_out < ?`,
      today,
    ),
    currentFindings(db),
    first<{ n: number; kobo: number }>(db, "SELECT count(*) AS n, coalesce(sum(amount_kobo), 0) AS kobo FROM payment_issues WHERE resolved_at IS NULL"),
    waitingCount(db),
  ]);
  const mine = forRole(findings, "owner");
  const byCheck = (c: string) => mine.filter((f) => f.check === c);
  const wrong: OwnerSnapshot["wrong"] = [];
  const toConfirm = byCheck("payments_to_confirm");
  if (toConfirm.length) wrong.push({ text: toConfirm[0]!.message, href: "/app/payments/confirm" });
  if (overdue?.n) wrong.push({ text: `${overdue.n} guest${overdue.n === 1 ? "" : "s"} overdue${overdue.owed > 0 ? ` · owe ${formatNaira(overdue.owed)}` : ", all paid"}`, href: "/app/today#overdue" });
  for (const f of byCheck("closing_unverified")) wrong.push({ text: f.message, href: "/app/sales/closing" });
  for (const f of byCheck("in_house_owes").slice(0, 3)) wrong.push({ text: f.message, href: "/app/today" });
  if (issues?.n) wrong.push({ text: `${issues.n} card payment${issues.n === 1 ? "" : "s"} declined but debited · ${formatNaira(issues.kobo)}: check with the bank`, href: "/app/payments/confirm" });
  if (approvals) wrong.push({ text: `${approvals} approval${approvals === 1 ? "" : "s"} waiting`, href: "/app/approvals" });
  for (const f of byCheck("pin_lockout")) wrong.push({ text: f.message, href: "/app/station" });
  for (const f of mine.filter((x) => !["payments_to_confirm", "closing_unverified", "in_house_owes", "pin_lockout", "overdue_checkout"].includes(x.check))) wrong.push({ text: f.message, href: "/app" });
  const total = rooms?.n ?? 0;
  const soldN = Math.min(sold?.n ?? 0, total);
  return {
    today,
    occupancy: { sold: soldN, rooms: total, pct: total ? Math.round((soldN / total) * 100) : 0 },
    takenTodayKobo: income.daily.find((d) => d.day === today)?.total ?? 0,
    bar: { kobo: bar?.kobo ?? 0, orders: bar?.n ?? 0 },
    overdue: { guests: overdue?.n ?? 0, owedKobo: Math.max(0, overdue?.owed ?? 0) },
    wrong,
    week: income.daily.map((d) => ({ day: d.day, kobo: d.total })),
  };
}
