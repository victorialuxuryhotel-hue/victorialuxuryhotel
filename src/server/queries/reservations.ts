import "server-only";
import type { ReservationStatus } from "@/domain/status";
import type { HistoryEntry, PaymentRow, ReservationDetail, ReservationRow } from "@/domain/views";
import { formatNaira } from "@/lib/format";
import { hotelToday as today } from "@/lib/hotel-date";
import { reservationStatus } from "@/domain/status";
import { authorizeRead } from "../auth";
import { all, first, getDb } from "../db";
import { cleanSearch } from "../db-errors";

/**
 * Staff reads of reservations. Every query starts with authorize(): with no
 * row-level security in D1, this (plus the role checks in the domain layer)
 * is what keeps staff data to staff.
 */

/** Columns for list rows, with net paid computed in the database. */
const LIST_COLUMNS = `
  r.id, r.reference, r.check_in, r.check_out, r.guest_count, r.total_amount_kobo, r.status, r.source, r.hold_expires_at, r.attention_reason,
  g.full_name AS guest_name, g.phone AS guest_phone, c.name AS category_name, rm.room_number,
  (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
     FROM payments p WHERE p.reservation_id = r.id AND p.status = 'successful') AS paid_kobo`;
const LIST_FROM = `FROM reservations r
  JOIN guests g ON g.id = r.guest_id
  JOIN room_categories c ON c.id = r.category_id
  LEFT JOIN rooms rm ON rm.id = r.room_id`;

type ListRow = {
  id: string; reference: string; check_in: string; check_out: string; guest_count: number; total_amount_kobo: number;
  status: ReservationStatus; source: ReservationRow["source"]; hold_expires_at: string | null; attention_reason: string | null;
  guest_name: string; guest_phone: string | null; category_name: string; room_number: string | null; paid_kobo: number;
};

function toRow(r: ListRow): ReservationRow {
  return {
    id: r.id,
    reference: r.reference,
    guestName: r.guest_name,
    guestPhone: r.guest_phone ?? undefined,
    category: r.category_name,
    roomNumber: r.room_number ?? undefined,
    checkIn: r.check_in,
    checkOut: r.check_out,
    guests: r.guest_count,
    totalKobo: r.total_amount_kobo,
    paidKobo: r.paid_kobo,
    status: r.status,
    source: r.source,
    holdExpiresAt: r.hold_expires_at ?? undefined,
    attention: r.attention_reason ?? undefined,
  };
}

/** Today's date at the hotel (Africa/Lagos). */
export async function hotelToday(): Promise<string> {
  return today();
}

export type ReservationTab = "upcoming" | "in_house" | "awaiting" | "attention" | "all";

const tabWhere: Record<ReservationTab, string> = {
  upcoming: "r.status IN ('pending_payment', 'confirmed') AND r.check_out >= ?today",
  in_house: "r.status = 'checked_in'",
  awaiting: "r.status = 'pending_payment'",
  attention: "r.attention_reason IS NOT NULL",
  all: "1 = 1",
};

export async function listReservations(opts: { tab?: ReservationTab; q?: string; status?: string; source?: string; guestId?: string; page?: number; pageSize?: number } = {}) {
  await authorizeRead();
  const db = await getDb();
  const tab = opts.tab ?? "upcoming";
  const size = opts.pageSize ?? 50;
  const where = [tabWhere[tab].replace("?today", "?")];
  const params: unknown[] = tab === "upcoming" ? [today()] : [];
  if (opts.status && opts.status in reservationStatus) {
    where.push("r.status = ?");
    params.push(opts.status);
  }
  if (opts.source) {
    where.push("r.source = ?");
    params.push(opts.source);
  }
  if (opts.guestId) {
    where.push("r.guest_id = ?");
    params.push(opts.guestId);
  }
  const q = cleanSearch(opts.q);
  if (q) {
    where.push("(r.reference LIKE ?1x OR g.full_name LIKE ?1x OR g.phone LIKE ?1x OR g.email LIKE ?1x)".replaceAll("?1x", "?"));
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  // One extra row tells the caller whether there is a next page.
  params.push(size + 1, ((opts.page ?? 1) - 1) * size);
  const rows = await all<ListRow>(
    db,
    `SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${where.join(" AND ")}
     ORDER BY r.check_in ${tab === "all" ? "DESC" : "ASC"}, r.id LIMIT ? OFFSET ?`,
    ...params,
  );
  return rows.map(toRow);
}

export async function tabCounts(): Promise<Record<Exclude<ReservationTab, "all">, number>> {
  await authorizeRead();
  const row = await first<Record<Exclude<ReservationTab, "all">, number>>(
    await getDb(),
    `SELECT
       sum(status IN ('pending_payment', 'confirmed') AND check_out >= ?) AS upcoming,
       sum(status = 'checked_in') AS in_house,
       sum(status = 'pending_payment') AS awaiting,
       sum(attention_reason IS NOT NULL) AS attention
     FROM reservations`,
    today(),
  );
  return { upcoming: row?.upcoming ?? 0, in_house: row?.in_house ?? 0, awaiting: row?.awaiting ?? 0, attention: row?.attention ?? 0 };
}

/** Arrivals (due today, not yet in) and departures (in house, due out today or overdue). */
export async function movements(day?: string) {
  await authorizeRead();
  const db = await getDb();
  const d = day ?? today();
  const [arrivals, departures, inHouse] = await Promise.all([
    all<ListRow>(db, `SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE r.check_in = ? AND r.status IN ('confirmed', 'pending_payment') ORDER BY r.created_at`, d),
    all<ListRow>(db, `SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE r.check_out <= ? AND r.status = 'checked_in' ORDER BY r.check_out`, d),
    all<ListRow>(db, `SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE r.status = 'checked_in' ORDER BY r.check_out`),
  ]);
  return { today: d, arrivals: arrivals.map(toRow), departures: departures.map(toRow), inHouse: inHouse.map(toRow) };
}

export async function getReservation(
  id: string,
): Promise<(ReservationDetail & { categoryId: string; roomId?: string; guestId: string; maxGuests: number; publicToken: string }) | null> {
  await authorizeRead();
  const db = await getDb();
  const r = await first<
    ListRow & {
      category_id: string; room_id: string | null; guest_id: string; nightly_rate_kobo: number; nights: number; special_requests: string | null;
      created_at: string; guest_email: string | null; max_occupancy: number; creator: string | null; public_token: string;
    }
  >(
    db,
    `SELECT ${LIST_COLUMNS}, r.category_id, r.room_id, r.guest_id, r.nightly_rate_kobo, r.nights, r.special_requests, r.created_at, r.public_token,
            g.email AS guest_email, c.max_occupancy, s.full_name AS creator
     ${LIST_FROM} LEFT JOIN staff_profiles s ON s.id = r.created_by
     WHERE r.id = ?`,
    id,
  );
  if (!r) return null;

  const [paymentRows, historyRows] = await Promise.all([
    all<{
      id: string; amount_kobo: number; method: string | null; provider: "paystack" | "offline"; provider_reference: string | null;
      status: PaymentRow["status"]; paid_at: string | null; receipt_number: string | null; recorder: string | null;
      kind: "payment" | "refund"; corrects_payment_id: string | null; notes: string | null; corrected_kobo: number;
    }>(
      db,
      `SELECT p.id, p.amount_kobo, p.method, p.provider, p.provider_reference, p.status, p.paid_at, p.receipt_number, s.full_name AS recorder,
              p.kind, p.corrects_payment_id, p.notes,
              (SELECT coalesce(sum(c.amount_kobo), 0) FROM payments c WHERE c.corrects_payment_id = p.id AND c.status = 'successful') AS corrected_kobo
       FROM payments p LEFT JOIN staff_profiles s ON s.id = p.recorded_by
       WHERE p.reservation_id = ? ORDER BY coalesce(p.paid_at, ''), p.created_at`,
      id,
    ),
    all<{ created_at: string; from_status: ReservationStatus | null; to_status: ReservationStatus; reason: string | null; changer: string | null }>(
      db,
      `SELECT h.created_at, h.from_status, h.to_status, h.reason, s.full_name AS changer
       FROM reservation_status_history h LEFT JOIN staff_profiles s ON s.id = h.changed_by
       WHERE h.reservation_id = ? ORDER BY h.created_at, h.id`,
      id,
    ),
  ]);

  const payments: PaymentRow[] = paymentRows.map((p) => ({
    id: p.id, reservationReference: r.reference, guestName: r.guest_name, amountKobo: p.amount_kobo,
    method: (p.method ?? "other") as PaymentRow["method"], provider: p.provider, providerReference: p.provider_reference ?? undefined,
    status: p.status, paidAt: p.paid_at ?? undefined, receiptNumber: p.receipt_number ?? undefined, recordedBy: p.recorder ?? undefined,
    kind: p.kind, correctsPaymentId: p.corrects_payment_id ?? undefined, correctedKobo: p.corrected_kobo, notes: p.notes ?? undefined,
  }));

  const history: HistoryEntry[] = historyRows.map((h) => ({
    at: h.created_at,
    label: h.from_status ? reservationStatus[h.to_status].label : `Created (${reservationStatus[h.to_status].label.toLowerCase()})`,
    by: h.changer ?? undefined,
    note: h.reason ?? undefined,
  }));
  for (const p of payments.filter((p) => p.status === "successful" && p.paidAt)) {
    history.push(
      p.kind === "refund"
        ? { at: p.paidAt!, label: `Payment corrected: −${formatNaira(p.amountKobo)}`, by: p.recordedBy, note: p.notes }
        : { at: p.paidAt!, label: `Payment received: ${formatNaira(p.amountKobo)}`, by: p.recordedBy, note: p.provider === "paystack" ? "Verified with Paystack" : undefined },
    );
  }
  history.sort((a, b) => a.at.localeCompare(b.at));

  return {
    ...toRow(r),
    categoryId: r.category_id,
    guestId: r.guest_id,
    maxGuests: r.max_occupancy,
    roomId: r.room_id ?? undefined,
    guestEmail: r.guest_email ?? undefined,
    nightlyRateKobo: r.nightly_rate_kobo,
    nights: r.nights,
    specialRequests: r.special_requests ?? undefined,
    createdAt: r.created_at,
    createdBy: r.creator ?? undefined,
    publicToken: r.public_token,
    payments,
    history,
  };
}

/** Which reservation a receipt number belongs to. */
export async function reservationIdForReceipt(receiptNumber: string): Promise<string | null> {
  await authorizeRead();
  const row = await first<{ reservation_id: string }>(await getDb(), "SELECT reservation_id FROM payments WHERE receipt_number = ?", receiptNumber);
  return row?.reservation_id ?? null;
}
