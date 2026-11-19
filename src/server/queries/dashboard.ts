import "server-only";
import type { PaymentRow } from "@/domain/views";
import { createClient } from "@/lib/supabase/server";
import { hotelToday, netPaid } from "./reservations";

const lagosDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(iso));

/**
 * Basic revenue visibility (not accounting). Three different measures, never mixed:
 *  - received:    verified money in (successful payments minus refunds), by payment date
 *  - bookedValue: value of stays ARRIVING this month that are confirmed, in house or completed
 *  - outstanding: unpaid balances on confirmed / in-house / completed stays
 */
export async function revenueSummary() {
  const supabase = await createClient();
  const today = await hotelToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const since = new Date(`${today}T00:00:00+01:00`);
  since.setUTCDate(since.getUTCDate() - 13);

  const [payments, stays] = await Promise.all([
    supabase.from("payments").select("amount_kobo, kind, paid_at").eq("status", "successful").gte("paid_at", new Date(Math.min(since.getTime(), Date.parse(`${monthStart}T00:00:00+01:00`))).toISOString()),
    supabase.from("reservations").select("check_in, total_amount_kobo, status, payments(amount_kobo, kind, status)").in("status", ["confirmed", "checked_in", "checked_out"]),
  ]);
  if (payments.error || stays.error) throw new Error("Could not load revenue", { cause: payments.error ?? stays.error });

  const signed = (p: { amount_kobo: number; kind: string }) => (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo);
  const daily = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    daily.set(d.toISOString().slice(0, 10), 0);
  }
  let receivedToday = 0;
  let receivedMonth = 0;
  for (const p of payments.data) {
    const day = lagosDate(p.paid_at!);
    if (daily.has(day)) daily.set(day, daily.get(day)! + signed(p));
    if (day === today) receivedToday += signed(p);
    if (day >= monthStart) receivedMonth += signed(p);
  }

  type Stay = { check_in: string; total_amount_kobo: number; payments: Array<{ amount_kobo: number; kind: "payment" | "refund"; status: string }> };
  let bookedValue = 0;
  let outstanding = 0;
  for (const s of stays.data as unknown as Stay[]) {
    if (s.check_in >= monthStart && s.check_in.slice(0, 7) === today.slice(0, 7)) bookedValue += s.total_amount_kobo;
    outstanding += Math.max(0, s.total_amount_kobo - netPaid(s.payments));
  }

  return { today, receivedToday, receivedMonth, bookedValue, outstanding, daily: [...daily.entries()].map(([day, kobo]) => ({ day, kobo })) };
}

export async function awaitingPaymentCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_payment")
    .gt("hold_expires_at", new Date().toISOString());
  return count ?? 0;
}

export async function listPayments(page = 1, size = 50): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount_kobo, method, provider, provider_reference, status, paid_at, receipt_number, reservation:reservations!inner(reference, guest:guests!inner(full_name)), recorder:staff_profiles!payments_recorded_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * size, (page - 1) * size + size);
  if (error) throw new Error("Could not load payments", { cause: error });
  type P = { id: string; amount_kobo: number; method: string | null; provider: "paystack" | "offline"; provider_reference: string | null; status: PaymentRow["status"]; paid_at: string | null; receipt_number: string | null; reservation: { reference: string; guest: { full_name: string } }; recorder: { full_name: string } | null };
  return (data as unknown as P[]).map((p) => ({
    id: p.id, reservationReference: p.reservation.reference, guestName: p.reservation.guest.full_name, amountKobo: p.amount_kobo,
    method: (p.method ?? "other") as PaymentRow["method"], provider: p.provider, providerReference: p.provider_reference ?? undefined,
    status: p.status, paidAt: p.paid_at ?? undefined, receiptNumber: p.receipt_number ?? undefined, recordedBy: p.recorder?.full_name,
  }));
}
