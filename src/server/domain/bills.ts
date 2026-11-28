// Company bills, paid before arrival (FUNCTIONALITY.md section 11, design P3). A bill covers one or more unpaid
// bookings for a company; it is not a receipt. Its bookings are held until the bill's valid-until date (then the
// usual hold expiry releases them and logs it). A payment against a bill is split across its bookings in order,
// and each booking gets its own numbered receipt.

import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { hotelInstant, hotelToday } from "@/lib/hotel-date";
import { activity, all, first, uuid, writeBatch, type Actor, type Db } from "../db";
import { recordOfflinePayment } from "./payments";
import { dueOf, loadReservation, netPaid } from "./reservations";

export type BillLine = { item: string; quantity: number; rateKobo: number; amountKobo: number };
export type Bill = {
  id: string; number: string; companyName: string; attention: string | null; reservationIds: string[]; references: string[]; lines: BillLine[];
  totalKobo: number; validUntil: string; createdAt: string; createdBy: string | null; cancelledAt: string | null; owedKobo: number;
  guests: number; checkIn: string; checkOut: string;
};

const need = (actor: Actor) => {
  if (!actor || !can(actor.role, "bills.manage")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
};

export async function createBill(
  db: Db,
  actor: Actor,
  v: { companyName: string; attention?: string | null; reservationIds: string[]; validUntil: string },
): Promise<{ id: string; number: string }> {
  need(actor);
  const company = v.companyName?.trim() ?? "";
  if (company.length < 2) throw new AppError("VALIDATION", "Enter the company's name.", { fieldErrors: { companyName: ["Enter the company"] } });
  const ids = [...new Set(v.reservationIds)];
  if (!ids.length || ids.length > 30) throw new AppError("VALIDATION", "Choose the bookings on this bill.", { fieldErrors: { reservationIds: ["Choose at least one booking"] } });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.validUntil) || v.validUntil < hotelToday()) throw new AppError("VALIDATION", "Valid until can't be in the past.", { fieldErrors: { validUntil: ["Choose a date"] } });

  const lines = new Map<string, BillLine>();
  let total = 0;
  for (const id of ids) {
    const res = await loadReservation(db, id);
    if (res.status !== "pending_payment") throw new AppError("VALIDATION", `${res.reference} isn't an unpaid booking. A bill is for bookings paid before arrival.`);
    if (v.validUntil > res.check_in) throw new AppError("VALIDATION", `Valid until must be on or before ${res.reference}'s arrival (${res.check_in}).`, { fieldErrors: { validUntil: ["Before arrival"] } });
    const open = await first<{ number: string }>(db, "SELECT number FROM bills WHERE cancelled_at IS NULL AND EXISTS (SELECT 1 FROM json_each(reservation_ids) WHERE value = ?)", id);
    if (open) throw new AppError("CONFLICT", `${res.reference} is already on bill ${open.number}. Cancel that bill first.`);
    const owed = dueOf(res) - (await netPaid(db, id));
    if (owed <= 0) continue;
    total += owed;
    const cat = await first<{ name: string }>(db, "SELECT name FROM room_categories WHERE id = ?", res.category_id);
    const nights = Math.round((Date.parse(res.check_out) - Date.parse(res.check_in)) / 86_400_000);
    const key = `room:${cat?.name}:${res.nightly_rate_kobo}`;
    const l = lines.get(key) ?? { item: `${cat?.name ?? "Room"} room, per night`, quantity: 0, rateKobo: res.nightly_rate_kobo, amountKobo: 0 };
    l.quantity += nights;
    l.amountKobo += res.nightly_rate_kobo * nights;
    lines.set(key, l);
    const extras = await all<{ name: string; unit_price_kobo: number; per_night: number }>(db, "SELECT name, unit_price_kobo, per_night FROM reservation_extras WHERE reservation_id = ?", id);
    for (const e of extras) {
      const qty = e.per_night ? nights : 1;
      const ek = `extra:${e.name}:${e.unit_price_kobo}`;
      const el = lines.get(ek) ?? { item: e.name, quantity: 0, rateKobo: e.unit_price_kobo, amountKobo: 0 };
      el.quantity += qty;
      el.amountKobo += e.unit_price_kobo * qty;
      lines.set(ek, el);
    }
    if (res.discount_kobo) {
      const dl = lines.get("discount") ?? { item: "Discount", quantity: 1, rateKobo: 0, amountKobo: 0 };
      dl.amountKobo -= res.discount_kobo;
      dl.rateKobo = dl.amountKobo;
      lines.set("discount", dl);
    }
  }
  if (total <= 0) throw new AppError("VALIDATION", "Nothing is owed on these bookings.");
  const id = uuid();
  const holdUntil = hotelInstant(v.validUntil, "23:59:00");
  await writeBatch(db, actor, [
    db.prepare("UPDATE bill_counter SET last_number = last_number + 1 WHERE id = 1"),
    db
      .prepare(
        `INSERT INTO bills (id, number, company_name, attention, reservation_ids, lines, total_kobo, valid_until, created_by)
         VALUES (?, 'B-' || printf('%04d', (SELECT last_number FROM bill_counter WHERE id = 1)), ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, company.slice(0, 120), v.attention?.trim() || null, JSON.stringify(ids), JSON.stringify([...lines.values()]), total, v.validUntil, actor!.id),
    // Bookings on a bill are held until its valid-until date.
    ...ids.map((r) => db.prepare("UPDATE reservations SET hold_expires_at = max(hold_expires_at, ?) WHERE id = ? AND status = 'pending_payment'").bind(holdUntil, r)),
    activity(db, "bill.created", "bill", id, `Company bill for ${company}: ${formatNaira(total)}, ${ids.length} booking${ids.length === 1 ? "" : "s"}, valid until ${v.validUntil}`, { reservation_ids: ids }),
  ]);
  const b = (await first<{ number: string }>(db, "SELECT number FROM bills WHERE id = ?", id))!;
  return { id, number: b.number };
}

export async function getBill(db: Db, actor: Actor, id: string): Promise<Bill | null> {
  need(actor);
  const b = await first<{ id: string; number: string; company_name: string; attention: string | null; reservation_ids: string; lines: string; total_kobo: number; valid_until: string; created_at: string; created_by: string | null; cancelled_at: string | null }>(
    db,
    "SELECT b.id, b.number, b.company_name, b.attention, b.reservation_ids, b.lines, b.total_kobo, b.valid_until, b.created_at, s.full_name AS created_by, b.cancelled_at FROM bills b LEFT JOIN staff_profiles s ON s.id = b.created_by WHERE b.id = ? OR b.number = ?",
    id,
    id.toUpperCase(),
  );
  if (!b) return null;
  const ids = JSON.parse(b.reservation_ids) as string[];
  const rows = await all<{ id: string; reference: string; guest_count: number; check_in: string; check_out: string }>(
    db,
    `SELECT id, reference, guest_count, check_in, check_out FROM reservations WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  let owed = 0;
  for (const r of ids) {
    const res = await loadReservation(db, r);
    if (["pending_payment", "confirmed", "checked_in"].includes(res.status)) owed += Math.max(0, dueOf(res) - (await netPaid(db, r)));
  }
  return {
    id: b.id, number: b.number, companyName: b.company_name, attention: b.attention, reservationIds: ids,
    references: ids.map((r) => rows.find((x) => x.id === r)?.reference ?? ""), lines: JSON.parse(b.lines) as BillLine[], totalKobo: b.total_kobo,
    validUntil: b.valid_until, createdAt: b.created_at, createdBy: b.created_by, cancelledAt: b.cancelled_at, owedKobo: owed,
    guests: rows.reduce((n, r) => n + r.guest_count, 0),
    checkIn: rows.map((r) => r.check_in).sort()[0] ?? "", checkOut: rows.map((r) => r.check_out).sort().at(-1) ?? "",
  };
}

export async function listBills(db: Db, actor: Actor) {
  need(actor);
  return all<{ id: string; number: string; company_name: string; total_kobo: number; valid_until: string; created_at: string; cancelled_at: string | null; bookings: number }>(
    db,
    "SELECT id, number, company_name, total_kobo, valid_until, created_at, cancelled_at, json_array_length(reservation_ids) AS bookings FROM bills ORDER BY created_at DESC LIMIT 200",
  );
}

export async function cancelBill(db: Db, actor: Actor, id: string): Promise<void> {
  need(actor);
  const [r] = await writeBatch(db, actor, [
    db.prepare("UPDATE bills SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), cancelled_by = ? WHERE id = ? AND cancelled_at IS NULL").bind(actor!.id, id),
    activity(db, "bill.cancelled", "bill", id, "Company bill cancelled"),
  ]);
  if (!r?.meta.changes) throw new AppError("CONFLICT", "That bill is already cancelled or doesn't exist.");
}

/**
 * A payment against a bill, split across its bookings in order (each booking's own balance first), each with its
 * own receipt. Any amount up to what's still owed on the bill.
 */
export async function payBill(
  db: Db,
  actor: Actor,
  billId: string,
  p: { amountKobo: number; method: "cash" | "bank_transfer" | "pos_terminal"; reference?: string | null; senderName?: string | null; slipLast4?: string | null; terminal?: string | null; paidOn: string; confirmReceived: boolean; duplicateOk?: boolean },
): Promise<{ receipts: { reference: string; receiptNumber: string; amountKobo: number }[] }> {
  if (!actor || !can(actor.role, "payments.record")) throw new AppError("FORBIDDEN", "Your role can't do this.");
  const bill = await getBill(db, actor, billId);
  if (!bill) throw new AppError("NOT_FOUND", "Bill not found.");
  if (bill.cancelledAt) throw new AppError("INVALID_TRANSITION", "This bill was cancelled.");
  if (!Number.isInteger(p.amountKobo) || p.amountKobo <= 0) throw new AppError("VALIDATION", "Enter the amount received.", { fieldErrors: { amount: ["Enter an amount"] } });
  if (p.amountKobo > bill.owedKobo) throw new AppError("VALIDATION", `Only ${formatNaira(bill.owedKobo)} is owed on this bill.`, { fieldErrors: { amount: [`At most ${formatNaira(bill.owedKobo)}`] } });
  let left = p.amountKobo;
  let lastPaymentId: string | null = null;
  const receipts: { reference: string; receiptNumber: string; amountKobo: number }[] = [];
  for (const [i, rid] of bill.reservationIds.entries()) {
    if (left <= 0) break;
    const res = await loadReservation(db, rid);
    if (!["pending_payment", "confirmed", "checked_in", "expired"].includes(res.status)) continue;
    const owed = dueOf(res) - (await netPaid(db, rid));
    if (owed <= 0) continue;
    const part = Math.min(left, owed);
    const r = await recordOfflinePayment(db, actor, {
      reservationId: rid, amountKobo: part, method: p.method, reference: p.reference, senderName: p.senderName, slipLast4: p.slipLast4, terminal: p.terminal,
      paidOn: p.paidOn, confirmReceived: p.confirmReceived, notes: `Company bill ${bill.number}`, duplicateOk: p.duplicateOk || i > 0 || receipts.length > 0,
    });
    receipts.push({ reference: res.reference, receiptNumber: r.receiptNumber, amountKobo: part });
    left -= part;
    lastPaymentId = r.paymentId;
  }
  await markBillLinksPaid(db, bill.id, lastPaymentId);
  return { receipts };
}

/** Once nothing is owed on a bill, its open payment links are marked paid (by the payment that cleared it). */
export async function markBillLinksPaid(db: Db, billId: string, paymentId: string | null): Promise<void> {
  if (!paymentId) return;
  const bill = await getBill(db, { id: "system", role: "owner" }, billId);
  if (!bill || bill.owedKobo > 0) return;
  await db.prepare("UPDATE pay_links SET paid_payment_id = ? WHERE bill_id = ? AND paid_payment_id IS NULL AND cancelled_at IS NULL").bind(paymentId, billId).run();
}
