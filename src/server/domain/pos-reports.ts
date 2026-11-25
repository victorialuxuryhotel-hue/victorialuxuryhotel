import { addDays, businessDate, businessDayStart, businessDaySql } from "@/lib/hotel-date";
import { all, first, POS_VIEWERS, requireRole, type Actor, type Db } from "../db";
import { rangeDates, type ReportRange } from "./reports";
import type { MenuCategory, Outlet, PayMethod } from "./pos";

export type PosRange = ReportRange;
export const posRangeDates = (range: PosRange, today = businessDate()) => rangeDates(range, today);

const DAY = businessDaySql("o.paid_at");

/** Sales, stock and money for the restaurant & bar, optionally one counter. Voided sales are counted separately, never as sales. */
export async function posReport(db: Db, actor: Actor, range: PosRange, outlet: Outlet | null = null, today = businessDate()) {
  requireRole(actor, POS_VIEWERS);
  const { from, to, days } = posRangeDates(range, today);
  const start = businessDayStart(from);
  const end = businessDayStart(addDays(to, 1));
  const out = outlet ? "AND o.outlet = ?" : "";
  const args = (...a: unknown[]) => [...a, ...(outlet ? [outlet] : [])];
  const PAID = `o.status = 'paid' AND o.paid_at >= ? AND o.paid_at < ? ${out}`;
  const [byDay, byItem, byCategory, byStaff, byMethod, voids, closings, stock, moves, transfers, cancelled] = await Promise.all([
    all<{ day: string; kobo: number; n: number }>(db, `SELECT ${DAY} AS day, sum(o.total_kobo) AS kobo, count(*) AS n FROM pos_orders o WHERE ${PAID} GROUP BY day`, ...args(start, end)),
    all<{ name: string; outlet: Outlet; qty: number; kobo: number }>(
      db,
      `SELECT i.name, o.outlet, sum(i.quantity) AS qty, sum(i.quantity * i.unit_price_kobo) AS kobo
       FROM pos_order_items i JOIN pos_orders o ON o.id = i.order_id WHERE ${PAID} GROUP BY i.name, o.outlet ORDER BY kobo DESC`,
      ...args(start, end),
    ),
    all<{ category: MenuCategory; qty: number; kobo: number }>(
      db,
      `SELECT i.category, sum(i.quantity) AS qty, sum(i.quantity * i.unit_price_kobo) AS kobo
       FROM pos_order_items i JOIN pos_orders o ON o.id = i.order_id WHERE ${PAID} GROUP BY i.category ORDER BY kobo DESC`,
      ...args(start, end),
    ),
    all<{ staff_id: string; who: string; n: number; kobo: number }>(
      db,
      `SELECT o.paid_by AS staff_id, s.full_name AS who, count(*) AS n, sum(o.total_kobo) AS kobo
       FROM pos_orders o JOIN staff_profiles s ON s.id = o.paid_by WHERE ${PAID} GROUP BY o.paid_by ORDER BY kobo DESC`,
      ...args(start, end),
    ),
    all<{ method: PayMethod; n: number; kobo: number }>(db, `SELECT o.method, count(*) AS n, sum(o.total_kobo) AS kobo FROM pos_orders o WHERE ${PAID} GROUP BY o.method`, ...args(start, end)),
    first<{ n: number; kobo: number }>(
      db,
      `SELECT count(*) AS n, coalesce(sum(o.total_kobo), 0) AS kobo FROM pos_orders o WHERE o.status = 'void' AND o.paid_at >= ? AND o.paid_at < ? ${out}`,
      ...args(start, end),
    ),
    all<{ n: number; diff: number; unverified: number }>(
      db,
      `SELECT count(*) AS n, coalesce(sum(counted_cash_kobo - expected_cash_kobo), 0) AS diff, coalesce(sum(verified_at IS NULL), 0) AS unverified
       FROM pos_closings WHERE business_date BETWEEN ? AND ?`,
      from, to,
    ),
    all<{ name: string; unit: string; quantity: number; min_quantity: number }>(
      db,
      "SELECT name, unit, quantity, min_quantity FROM stock_items WHERE is_active = 1 ORDER BY quantity <= min_quantity DESC, name",
    ),
    all<{ name: string; unit: string; kind: string; qty: number }>(
      db,
      `SELECT i.name, i.unit, m.kind, sum(abs(m.change)) AS qty FROM stock_moves m JOIN stock_items i ON i.id = m.item_id
       WHERE m.created_at >= ? AND m.created_at < ? GROUP BY i.name, i.unit, m.kind`,
      start, end,
    ),
    // Every transfer sale, by salesperson, for the manager to tick off against the bank statement (I10).
    all<{ who: string; paid_at: string; receipt_number: string; outlet: Outlet; kobo: number; reference: string | null }>(
      db,
      `SELECT s.full_name AS who, o.paid_at, o.receipt_number, o.outlet, o.total_kobo AS kobo, o.transfer_reference AS reference
       FROM pos_orders o JOIN staff_profiles s ON s.id = o.paid_by
       WHERE ${PAID} AND o.method = 'bank_transfer' ORDER BY s.full_name, o.paid_at`,
      ...args(start, end),
    ),
    // Unpaid orders cancelled, with who and why (rules 2.5: visible to the manager).
    all<{ number: number; who: string; closed_at: string; outlet: Outlet; kobo: number; reason: string | null }>(
      db,
      `SELECT o.number, s.full_name AS who, o.closed_at, o.outlet, o.total_kobo AS kobo, o.close_reason AS reason
       FROM pos_orders o JOIN staff_profiles s ON s.id = o.closed_by
       WHERE o.status = 'cancelled' AND o.closed_at >= ? AND o.closed_at < ? ${out} ORDER BY o.closed_at DESC`,
      ...args(start, end),
    ),
  ]);
  const salesKobo = byDay.reduce((s, d) => s + d.kobo, 0);
  const sales = byDay.reduce((s, d) => s + d.n, 0);
  const daily = days.map((day) => ({ day, kobo: byDay.find((d) => d.day === day)?.kobo ?? 0, n: byDay.find((d) => d.day === day)?.n ?? 0 }));
  const method: Record<PayMethod, number> = { cash: 0, bank_transfer: 0, pos_terminal: 0 };
  for (const m of byMethod) method[m.method] = m.kobo;
  const stockMoves = new Map<string, { name: string; unit: string; received: number; used: number; wasted: number; sold: number; returned: number; adjusted: number }>();
  for (const m of moves) {
    const r = stockMoves.get(m.name) ?? { name: m.name, unit: m.unit, received: 0, used: 0, wasted: 0, sold: 0, returned: 0, adjusted: 0 };
    r[m.kind as keyof typeof r] = m.qty as never;
    stockMoves.set(m.name, r);
  }
  return {
    from, to, outlet, sales, salesKobo, daily, byItem, byCategory, byStaff, byMethod: method,
    voids: voids?.n ?? 0, voidsKobo: voids?.kobo ?? 0, transfers, cancelled,
    closings: closings[0] ?? { n: 0, diff: 0, unverified: 0 },
    stock, lowStock: stock.filter((s) => s.quantity <= s.min_quantity), stockMoves: [...stockMoves.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
