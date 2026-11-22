import type { PaymentMethod, PaymentStatus } from "@/domain/status";
import { effectivePaymentView, type PaymentView } from "@/lib/auth/permissions";
import { hotelToday } from "@/lib/hotel-date";
import { ALL_STAFF, all, first, requireRole, type Actor, type Db } from "../db";

/** Desk staff take payments; finance reads them all. */
const PAYMENT_READERS = [...ALL_STAFF, "finance"] as const;

/**
 * Who may see which payments on the Payments page.
 *
 * Roles that can see revenue (`reports.view`) see every payment. Everyone else
 * (front desk) sees only payments made today, Lagos time, or ones they
 * recorded themselves. The limit is applied in SQL here, so no page can show
 * more than this returns. A reservation's own page still shows its full
 * payment history to every role; that query is separate. Which views each
 * role may use is decided in src/lib/auth/permissions.ts.
 */
/** Lagos is UTC+1 all year, so the hotel date of a stored UTC timestamp is date(ts, '+1 hour'). */
const HOTEL_DATE = (col: string) => `date(${col}, '+1 hour')`;
const PAID_OR_CREATED = "coalesce(p.paid_at, p.created_at)";

export function paymentScopeSql(view: PaymentView, staffId: string, today: string): { where: string; params: unknown[] } {
  switch (view) {
    case "all":
      return { where: "1", params: [] };
    case "today":
      return { where: `${HOTEL_DATE(PAID_OR_CREATED)} = ?`, params: [today] };
    case "mine":
      return { where: "p.recorded_by = ?", params: [staffId] };
  }
}

export type ListedPayment = {
  id: string; amount_kobo: number; kind: "payment" | "refund"; method: PaymentMethod | null; provider: "paystack" | "offline";
  provider_reference: string | null; status: PaymentStatus; paid_at: string | null; created_at: string; receipt_number: string | null;
  reservation_id: string; reference: string; guest_name: string; recorder: string | null; recorded_by: string | null;
};

const SELECT = `SELECT p.id, p.amount_kobo, p.kind, p.method, p.provider, p.provider_reference, p.status, p.paid_at, p.created_at,
    p.receipt_number, p.reservation_id, r.reference, g.full_name AS guest_name, s.full_name AS recorder, p.recorded_by
  FROM payments p JOIN reservations r ON r.id = p.reservation_id JOIN guests g ON g.id = r.guest_id
  LEFT JOIN staff_profiles s ON s.id = p.recorded_by`;

/** One page of payments in the requested view, limited to what the role may see. */
export async function listPaymentsFor(
  db: Db,
  actor: Actor,
  opts: { view?: string; page?: number; size?: number; today?: string },
): Promise<{ view: PaymentView; rows: ListedPayment[] }> {
  requireRole(actor, PAYMENT_READERS);
  const view = effectivePaymentView(actor.role, opts.view);
  const size = opts.size ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const scope = paymentScopeSql(view, actor.id, opts.today ?? hotelToday());
  const rows = await all<ListedPayment>(
    db,
    `${SELECT} WHERE ${scope.where} ORDER BY ${PAID_OR_CREATED} DESC, p.id LIMIT ? OFFSET ?`,
    ...scope.params,
    size + 1,
    (page - 1) * size,
  );
  return { view, rows };
}

export type FrontDeskSummary = {
  /** Payments made today (any status), the "Today" count. */
  todayCount: number;
  /** Payments this person has ever recorded, the "Recorded by me" count (all time). */
  mineCount: number;
  /** Money actually received today, net of corrections, by how it was paid. */
  totals: { cash: number; transfer: number; cardOnline: number; pos: number; other: number };
};

/** Counts and today's takings for the front-desk Payments page. */
export async function frontDeskSummary(db: Db, actor: Actor, today = hotelToday()): Promise<FrontDeskSummary> {
  requireRole(actor, PAYMENT_READERS);
  const t = paymentScopeSql("today", actor.id, today);
  const m = paymentScopeSql("mine", actor.id, today);
  const [counts, totals] = await Promise.all([
    first<{ today: number; mine: number }>(
      db,
      `SELECT (SELECT count(*) FROM payments p WHERE ${t.where}) AS today, (SELECT count(*) FROM payments p WHERE ${m.where}) AS mine`,
      ...t.params,
      ...m.params,
    ),
    all<{ bucket: keyof FrontDeskSummary["totals"]; kobo: number }>(
      db,
      `SELECT CASE
           WHEN p.provider = 'paystack' THEN 'cardOnline'
           WHEN p.method = 'cash' THEN 'cash'
           WHEN p.method = 'bank_transfer' THEN 'transfer'
           WHEN p.method = 'pos_terminal' THEN 'pos'
           ELSE 'other' END AS bucket,
         sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END) AS kobo
       FROM payments p WHERE p.status = 'successful' AND ${t.where} GROUP BY bucket`,
      ...t.params,
    ),
  ]);
  const sum = { cash: 0, transfer: 0, cardOnline: 0, pos: 0, other: 0 };
  for (const r of totals) sum[r.bucket] = r.kobo;
  return { todayCount: counts?.today ?? 0, mineCount: counts?.mine ?? 0, totals: sum };
}
