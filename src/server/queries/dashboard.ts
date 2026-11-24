import "server-only";
import { financeSummary } from "../domain/finance";
import type { PaymentRow } from "@/domain/views";
import { addDays, hotelDateOf, hotelToday } from "@/lib/hotel-date";
import { actorOf, authorizeRead } from "../auth";
import { all, first, getDb } from "../db";
import { frontDeskSummary, listPaymentsFor } from "../domain/payment-list";

export async function revenueSummary() {
  await authorizeRead("reports.view");
  const db = await getDb();
  const today = hotelToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const firstDay = addDays(today, -13) < monthStart ? addDays(today, -13) : monthStart;
  const since = new Date(`${firstDay}T00:00:00+01:00`).toISOString();

  const [payments, stays] = await Promise.all([
    all<{ amount_kobo: number; kind: string; paid_at: string }>(db, "SELECT amount_kobo, kind, paid_at FROM payments WHERE status = 'successful' AND paid_at >= ?", since),
    first<{ booked: number; outstanding: number }>(
      db,
      `SELECT
         coalesce(sum(CASE WHEN substr(check_in, 1, 7) = ?1 THEN (total_amount_kobo + extras_kobo - discount_kobo) ELSE 0 END), 0) AS booked,
         coalesce(sum(max(0, (total_amount_kobo + extras_kobo - discount_kobo) - (
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
  await authorizeRead(["reservations.manage", "reports.view"]);
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
const toPayment = (p: P): PaymentRow => ({
  id: p.id, reservationId: p.reservation_id, reservationReference: p.reference, guestName: p.guest_name, amountKobo: p.amount_kobo,
  method: (p.method ?? "other") as PaymentRow["method"], provider: p.provider, providerReference: p.provider_reference ?? undefined,
  status: p.status, paidAt: p.paid_at ?? undefined, receiptNumber: p.receipt_number ?? undefined, recordedBy: p.recorder ?? undefined,
});

export async function listPayments(opts: { view?: string; page?: number; size?: number }) {
  const staff = await authorizeRead(["payments.record", "reports.view"]);
  const { view, rows } = await listPaymentsFor(await getDb(), actorOf(staff), opts);
  return {
    view,
    rows: rows.map((p): PaymentRow & { at: string; recordedById?: string; kind: "payment" | "refund" } => ({
      ...toPayment({ ...p, method: p.method }),
      at: p.paid_at ?? p.created_at,
      recordedById: p.recorded_by ?? undefined,
      kind: p.kind,
    })),
  };
}

export async function frontDeskPayments() {
  const staff = await authorizeRead("payments.record");
  return frontDeskSummary(await getDb(), actorOf(staff));
}

export async function departmentsOverview() {
  const staff = await authorizeRead("reports.view");
  const db = await getDb();
  const actor = actorOf(staff);
  const today = hotelToday();
  const [day, month, counts] = await Promise.all([
    financeSummary(db, actor, "today", today),
    financeSummary(db, actor, "month", today),
    first<{ in_house: number; rooms: number; bookings: number; halls: number; restaurant: number; bar: number }>(
      db,
      `SELECT (SELECT count(*) FROM reservations WHERE status = 'checked_in') AS in_house,
              (SELECT count(*) FROM rooms WHERE is_active = 1) AS rooms,
              (SELECT count(*) FROM reservations WHERE status IN ('confirmed', 'checked_in', 'checked_out') AND substr(check_in, 1, 7) = ?1) AS bookings,
              (SELECT count(*) FROM hall_bookings WHERE status = 'confirmed' AND event_date >= ?2) AS halls,
              (SELECT count(*) FROM pos_orders WHERE status = 'paid' AND outlet = 'restaurant' AND date(paid_at, '+1 hour') = ?2) AS restaurant,
              (SELECT count(*) FROM pos_orders WHERE status = 'paid' AND outlet = 'bar' AND date(paid_at, '+1 hour') = ?2) AS bar`,
      today.slice(0, 7),
      today,
    ),
  ]);
  const dept = (k: string) => month.departments.find((d) => d.key === k)!;
  const c = counts ?? { in_house: 0, rooms: 0, bookings: 0, halls: 0, restaurant: 0, bar: 0 };
  return {
    rows: [
      { key: "rooms", label: "Hotel rooms", today: day.income.rooms, month: month.income.rooms, expenses: dept("rooms").expensesKobo, note: `${c.in_house} of ${c.rooms} rooms occupied · ${c.bookings} ${c.bookings === 1 ? "booking" : "bookings"} this month`, href: "/app/reports?tab=money&range=month&dept=rooms" },
      { key: "restaurant", label: "Restaurant", today: day.income.restaurant, month: month.income.restaurant, expenses: dept("restaurant").expensesKobo, note: `${c.restaurant} ${c.restaurant === 1 ? "sale" : "sales"} today`, href: "/app/sales/reports?range=month&outlet=restaurant" },
      { key: "bar", label: "Bar", today: day.income.bar, month: month.income.bar, expenses: dept("bar").expensesKobo, note: `${c.bar} ${c.bar === 1 ? "sale" : "sales"} today`, href: "/app/sales/reports?range=month&outlet=bar" },
      { key: "hall", label: "Conference hall", today: day.income.hall, month: month.income.hall, expenses: dept("hall").expensesKobo, note: `${c.halls} confirmed ${c.halls === 1 ? "event" : "events"} coming up`, href: "/app/events" },
    ],
    general: dept("general").expensesKobo,
    total: { today: day.incomeTotal, month: month.incomeTotal, expenses: month.expensesKobo, net: month.netKobo },
  };
}
