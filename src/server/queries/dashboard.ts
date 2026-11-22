import "server-only";
import type { PaymentRow } from "@/domain/views";
import { addDays, hotelDateOf, hotelToday } from "@/lib/hotel-date";
import { authorize } from "../auth";
import { all, first, getDb } from "../db";

/**
 * Basic revenue visibility (not accounting). Three different measures, never mixed:
 *  - received:    verified money in (successful payments minus refunds), by payment date
 *  - bookedValue: value of stays ARRIVING this month that are confirmed, in house or completed
 *  - outstanding: unpaid balances on confirmed / in-house / completed stays
 */
export async function revenueSummary() {
  await authorize("reports.view");
  const db = await getDb();
  const today = hotelToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const firstDay = addDays(today, -13) < monthStart ? addDays(today, -13) : monthStart;
  // Hotel-local midnight (UTC+1) of the earliest day needed, as a UTC instant.
  const since = new Date(`${firstDay}T00:00:00+01:00`).toISOString();

  const [payments, stays] = await Promise.all([
    all<{ amount_kobo: number; kind: string; paid_at: string }>(db, "SELECT amount_kobo, kind, paid_at FROM payments WHERE status = 'successful' AND paid_at >= ?", since),
    first<{ booked: number; outstanding: number }>(
      db,
      `SELECT
         coalesce(sum(CASE WHEN substr(check_in, 1, 7) = ?1 THEN total_amount_kobo ELSE 0 END), 0) AS booked,
         coalesce(sum(max(0, total_amount_kobo - (
           SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
           FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful'))), 0) AS outstanding
       FROM reservations r WHERE status IN ('confirmed', 'checked_in', 'checked_out')`,
      today.slice(0, 7),
    ),
  ]);

  const signed = (p: { amount_kobo: number; kind: string }) => (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo);
  const daily = new Map<string, number>();
  for (let i = 13; i >= 0; i--) daily.set(addDays(today, -i), 0);
  let receivedToday = 0;
  let receivedMonth = 0;
  for (const p of payments) {
    const day = hotelDateOf(p.paid_at);
    if (daily.has(day)) daily.set(day, daily.get(day)! + signed(p));
    if (day === today) receivedToday += signed(p);
    if (day >= monthStart) receivedMonth += signed(p);
  }

  return {
    today,
    receivedToday,
    receivedMonth,
    bookedValue: stays?.booked ?? 0,
    outstanding: stays?.outstanding ?? 0,
    daily: [...daily.entries()].map(([day, kobo]) => ({ day, kobo })),
  };
}

export async function awaitingPaymentCount() {
  await authorize();
  const row = await first<{ n: number }>(
    await getDb(),
    "SELECT count(*) AS n FROM reservations WHERE status = 'pending_payment' AND hold_expires_at > ?",
    new Date().toISOString(),
  );
  return row?.n ?? 0;
}

type P = {
  id: string; amount_kobo: number; method: string | null; provider: "paystack" | "offline"; provider_reference: string | null; status: PaymentRow["status"];
  paid_at: string | null; receipt_number: string | null; reservation_id: string; reference: string; guest_name: string; recorder: string | null;
};
const PAYMENT_SELECT = `SELECT p.id, p.amount_kobo, p.method, p.provider, p.provider_reference, p.status, p.paid_at, p.receipt_number,
    p.reservation_id, r.reference, g.full_name AS guest_name, s.full_name AS recorder
  FROM payments p JOIN reservations r ON r.id = p.reservation_id JOIN guests g ON g.id = r.guest_id
  LEFT JOIN staff_profiles s ON s.id = p.recorded_by`;

const toPayment = (p: P): PaymentRow => ({
  id: p.id, reservationId: p.reservation_id, reservationReference: p.reference, guestName: p.guest_name, amountKobo: p.amount_kobo,
  method: (p.method ?? "other") as PaymentRow["method"], provider: p.provider, providerReference: p.provider_reference ?? undefined,
  status: p.status, paidAt: p.paid_at ?? undefined, receiptNumber: p.receipt_number ?? undefined, recordedBy: p.recorder ?? undefined,
});

export async function listPayments(page = 1, size = 50): Promise<PaymentRow[]> {
  await authorize();
  const rows = await all<P>(await getDb(), `${PAYMENT_SELECT} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`, size + 1, (page - 1) * size);
  return rows.map(toPayment);
}
