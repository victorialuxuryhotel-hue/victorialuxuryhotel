import "server-only";
import type { ReservationStatus } from "@/domain/status";
import type { HistoryEntry, PaymentRow, ReservationDetail, ReservationRow } from "@/domain/views";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/format";
import { cleanSearch } from "../db-errors";
import { reservationStatus } from "@/domain/status";

const listSelect = `
  id, reference, check_in, check_out, guest_count, total_amount_kobo, status, source, hold_expires_at, attention_reason,
  guest:guests!inner(full_name, phone),
  category:room_categories!inner(name),
  room:rooms(room_number),
  payments(amount_kobo, kind, status)
` as const;

type PaymentLite = { amount_kobo: number; kind: "payment" | "refund"; status: string };

/** Net verified money in for a reservation (payments minus refunds). */
export function netPaid(payments: PaymentLite[]): number {
  return payments
    .filter((p) => p.status === "successful")
    .reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0);
}

type ListRow = {
  id: string; reference: string; check_in: string; check_out: string; guest_count: number; total_amount_kobo: number;
  status: ReservationStatus; source: ReservationRow["source"]; hold_expires_at: string | null; attention_reason: string | null;
  guest: { full_name: string; phone: string | null }; category: { name: string }; room: { room_number: string } | null;
  payments: PaymentLite[];
};

function toRow(r: ListRow): ReservationRow {
  return {
    id: r.id,
    reference: r.reference,
    guestName: r.guest.full_name,
    guestPhone: r.guest.phone ?? undefined,
    category: r.category.name,
    roomNumber: r.room?.room_number,
    checkIn: r.check_in,
    checkOut: r.check_out,
    guests: r.guest_count,
    totalKobo: r.total_amount_kobo,
    paidKobo: netPaid(r.payments),
    status: r.status,
    source: r.source,
    holdExpiresAt: r.hold_expires_at ?? undefined,
    attention: r.attention_reason ?? undefined,
  };
}

export async function hotelToday(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hotel_today");
  if (error) throw new Error("Could not read hotel date", { cause: error });
  return data as unknown as string;
}

export type ReservationTab = "upcoming" | "in_house" | "awaiting" | "attention" | "all";

export async function listReservations(opts: { tab?: ReservationTab; q?: string; status?: string; source?: string; guestId?: string; page?: number; pageSize?: number } = {}) {
  const supabase = await createClient();
  const today = await hotelToday();
  const size = opts.pageSize ?? 50;
  const from = ((opts.page ?? 1) - 1) * size;
  // One extra row tells the caller whether there is a next page.
  let query = supabase.from("reservations").select(listSelect).order("check_in", { ascending: opts.tab !== "all" }).order("id").range(from, from + size);

  switch (opts.tab ?? "upcoming") {
    case "upcoming":
      query = query.in("status", ["pending_payment", "confirmed"]).gte("check_out", today);
      break;
    case "in_house":
      query = query.eq("status", "checked_in");
      break;
    case "awaiting":
      query = query.eq("status", "pending_payment");
      break;
    case "attention":
      query = query.not("attention_reason", "is", null);
      break;
    case "all":
      break;
  }
  if (opts.status && opts.status in reservationStatus) query = query.eq("status", opts.status as ReservationStatus);
  if (opts.source) query = query.eq("source", opts.source as ReservationRow["source"]);
  if (opts.guestId) query = query.eq("guest_id", opts.guestId);

  const q = cleanSearch(opts.q);
  if (q) {
    const { data: guests } = await supabase
      .from("guests")
      .select("id")
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(100);
    const ids = (guests ?? []).map((g) => g.id);
    query = query.or([`reference.ilike.%${q}%`, ids.length ? `guest_id.in.(${ids.join(",")})` : null].filter(Boolean).join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error("Could not load reservations", { cause: error });
  return (data as unknown as ListRow[]).map(toRow);
}

export async function tabCounts(): Promise<Record<Exclude<ReservationTab, "all">, number>> {
  const supabase = await createClient();
  const today = await hotelToday();
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await build(base())).count ?? 0;
  const base = () => supabase.from("reservations").select("id", { count: "exact", head: true });
  const [upcoming, in_house, awaiting, attention] = await Promise.all([
    count((q) => q.in("status", ["pending_payment", "confirmed"]).gte("check_out", today)),
    count((q) => q.eq("status", "checked_in")),
    count((q) => q.eq("status", "pending_payment")),
    count((q) => q.not("attention_reason", "is", null)),
  ]);
  return { upcoming, in_house, awaiting, attention };
}

/** Arrivals (due today, not yet in) and departures (in house, due out today or overdue). */
export async function movements(day?: string) {
  const supabase = await createClient();
  const today = day ?? (await hotelToday());
  const [arrivals, departures, inHouse] = await Promise.all([
    supabase.from("reservations").select(listSelect).eq("check_in", today).in("status", ["confirmed", "pending_payment"]).order("created_at"),
    supabase.from("reservations").select(listSelect).lte("check_out", today).eq("status", "checked_in").order("check_out"),
    supabase.from("reservations").select(listSelect).eq("status", "checked_in").order("check_out"),
  ]);
  for (const r of [arrivals, departures, inHouse]) if (r.error) throw new Error("Could not load front desk", { cause: r.error });
  return {
    today,
    arrivals: (arrivals.data as unknown as ListRow[]).map(toRow),
    departures: (departures.data as unknown as ListRow[]).map(toRow),
    inHouse: (inHouse.data as unknown as ListRow[]).map(toRow),
  };
}

const methodOf = (m: string | null): PaymentRow["method"] => (m ?? "other") as PaymentRow["method"];

export async function getReservation(id: string): Promise<(ReservationDetail & { categoryId: string; roomId?: string; guestId: string; maxGuests: number }) | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(`
      ${listSelect}, category_id, room_id, nightly_rate_kobo, nights, special_requests, created_at, cancellation_reason,
      guest_full:guests!inner(id, email),
      cat_full:room_categories!inner(max_occupancy),
      creator:staff_profiles!reservations_created_by_fkey(full_name),
      payment_rows:payments(id, amount_kobo, method, provider, provider_reference, status, paid_at, receipt_number, kind, recorder:staff_profiles!payments_recorded_by_fkey(full_name)),
      history:reservation_status_history(created_at, from_status, to_status, reason, changer:staff_profiles(full_name))
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load reservation", { cause: error });
  if (!data) return null;

  const r = data as unknown as ListRow & {
    category_id: string; room_id: string | null; nightly_rate_kobo: number; nights: number; special_requests: string | null; created_at: string;
    guest_full: { id: string; email: string | null }; cat_full: { max_occupancy: number }; creator: { full_name: string } | null;
    payment_rows: Array<{ id: string; amount_kobo: number; method: string | null; provider: "paystack" | "offline"; provider_reference: string | null; status: PaymentRow["status"]; paid_at: string | null; receipt_number: string | null; kind: string; recorder: { full_name: string } | null }>;
    history: Array<{ created_at: string; from_status: ReservationStatus | null; to_status: ReservationStatus; reason: string | null; changer: { full_name: string } | null }>;
  };

  const payments: PaymentRow[] = r.payment_rows
    .sort((a, b) => (a.paid_at ?? "").localeCompare(b.paid_at ?? ""))
    .map((p) => ({
      id: p.id, reservationReference: r.reference, guestName: r.guest.full_name, amountKobo: p.amount_kobo, method: methodOf(p.method),
      provider: p.provider, providerReference: p.provider_reference ?? undefined, status: p.status, paidAt: p.paid_at ?? undefined,
      receiptNumber: p.receipt_number ?? undefined, recordedBy: p.recorder?.full_name,
    }));

  const history: HistoryEntry[] = r.history
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((h) => ({
      at: h.created_at,
      label: h.from_status ? reservationStatus[h.to_status].label : `Created (${reservationStatus[h.to_status].label.toLowerCase()})`,
      by: h.changer?.full_name,
      note: h.reason ?? undefined,
    }));
  for (const p of payments.filter((p) => p.status === "successful" && p.paidAt)) {
    history.push({ at: p.paidAt!, label: `Payment received: ${formatNaira(p.amountKobo)}`, by: p.recordedBy, note: p.provider === "paystack" ? "Verified with Paystack" : undefined });
  }
  history.sort((a, b) => a.at.localeCompare(b.at));

  return {
    ...toRow(r),
    categoryId: r.category_id,
    guestId: r.guest_full.id,
    maxGuests: r.cat_full.max_occupancy,
    roomId: r.room_id ?? undefined,
    guestEmail: r.guest_full.email ?? undefined,
    nightlyRateKobo: r.nightly_rate_kobo,
    nights: r.nights,
    specialRequests: r.special_requests ?? undefined,
    createdAt: r.created_at,
    createdBy: r.creator?.full_name,
    payments,
    history,
  };
}
