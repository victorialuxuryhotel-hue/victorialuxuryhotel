// Payment links (FUNCTIONALITY.md section 10, designs X14 and M14). The desk sends /pay/<code> for an unpaid or
// part-paid booking; the guest pays through Paystack with the existing verify and webhook flow. The code is random,
// not the booking reference. A link stops working when the booking is paid, the link is cancelled or replaced, or
// it expires (the hold's end for an unpaid booking; 3 days for a part-paid one).

import { can } from "@/lib/auth/permissions";
import { newToken } from "@/lib/auth/pin";
import { AppError } from "@/lib/errors";
import { formatDate, formatNaira } from "@/lib/format";
import { hotelInstant } from "@/lib/hotel-date";
import { activity, all, first, uuid, writeBatch, type Actor, type Db } from "../db";
import { getBill } from "./bills";
import { dueOf, loadReservation, netPaid } from "./reservations";

const PART_PAID_DAYS = 3;

export type PayLink = { code: string; amountKobo: number; expiresAt: string; message: string; phone: string | null; email: string | null; guestName: string; reference: string };

export async function createPayLink(db: Db, actor: Actor, reservationId: string, siteUrl: string): Promise<PayLink> {
  if (!actor || !can(actor.role, "paylinks.create")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  const res = await loadReservation(db, reservationId);
  const balance = dueOf(res) - (await netPaid(db, res.id));
  if (balance <= 0) throw new AppError("VALIDATION", "Nothing is owed on this booking.");
  let expiresAt: string;
  if (res.status === "pending_payment") {
    if (!res.hold_expires_at || res.hold_expires_at <= new Date().toISOString()) throw new AppError("UNAVAILABLE", "The hold on this booking has ended. Make a new booking, or take the payment at the desk.");
    expiresAt = res.hold_expires_at;
  } else if (res.status === "confirmed" || res.status === "checked_in") {
    expiresAt = new Date(Date.now() + PART_PAID_DAYS * 86_400_000).toISOString();
  } else {
    throw new AppError("INVALID_TRANSITION", "This booking can't be paid any more.");
  }
  const guest = await first<{ full_name: string; phone: string | null; email: string | null }>(db, "SELECT full_name, phone, email FROM guests WHERE id = ?", res.guest_id);
  const cat = await first<{ name: string }>(db, "SELECT name FROM room_categories WHERE id = ?", res.category_id);
  const code = newToken();
  await writeBatch(db, actor, [
    // One live link per booking: a new one replaces the old.
    db.prepare("UPDATE pay_links SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE reservation_id = ? AND cancelled_at IS NULL AND paid_payment_id IS NULL").bind(res.id),
    db.prepare("INSERT INTO pay_links (code, reservation_id, amount_kobo, expires_at, created_by) VALUES (?, ?, ?, ?, ?)").bind(code, res.id, balance, expiresAt, actor.id),
    activity(db, "payment.link_created", "reservation", res.id, `Payment link for ${formatNaira(balance)} created for ${res.reference}`, { amount_kobo: balance }),
  ]);
  const first_ = guest?.full_name.split(" ")[0] ?? "there";
  const url = `${siteUrl.replace(/\/$/, "")}/pay/${code}`;
  const until = new Date(expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
  const message = `Hello ${first_}, here's the link to pay ${formatNaira(balance)} for your ${cat?.name ?? "room"} on ${formatDate(res.check_in, { weekday: true, year: false })}: ${url}${res.status === "pending_payment" ? ` (held until ${until})` : ""} · Victoria Luxury`;
  return { code, amountKobo: balance, expiresAt, message, phone: guest?.phone ?? null, email: guest?.email ?? null, guestName: guest?.full_name ?? "", reference: res.reference };
}

export type LinkView =
  | { state: "open"; reference: string; firstName: string; category: string; guests: number; checkIn: string; checkOut: string; nights: number; amountKobo: number; heldUntil: string | null; needsEmail: boolean }
  | { state: "paid"; token: string }
  | { state: "closed"; reason: "expired" | "cancelled" | "unknown" };

/** What the guest's pay page shows. No sign-in: the random code is the key. */
export async function payLinkView(db: Db, code: string): Promise<LinkView> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return { state: "closed", reason: "unknown" };
  const l = await first<{ reservation_id: string | null; expires_at: string; cancelled_at: string | null }>(db, "SELECT reservation_id, expires_at, cancelled_at FROM pay_links WHERE code = ?", code);
  if (!l?.reservation_id) return { state: "closed", reason: "unknown" };
  const res = await loadReservation(db, l.reservation_id);
  const token = (await first<{ public_token: string }>(db, "SELECT public_token FROM reservations WHERE id = ?", res.id))!.public_token;
  const balance = dueOf(res) - (await netPaid(db, res.id));
  if (balance <= 0) return { state: "paid", token };
  if (l.cancelled_at) return { state: "closed", reason: "cancelled" };
  const now = new Date().toISOString();
  if (l.expires_at <= now || (res.status === "pending_payment" && (!res.hold_expires_at || res.hold_expires_at <= now))) return { state: "closed", reason: "expired" };
  if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) return { state: "closed", reason: "expired" };
  const guest = await first<{ full_name: string; email: string | null }>(db, "SELECT full_name, email FROM guests WHERE id = ?", res.guest_id);
  const cat = await first<{ name: string }>(db, "SELECT name FROM room_categories WHERE id = ?", res.category_id);
  return {
    state: "open", reference: res.reference, firstName: guest?.full_name.split(" ")[0] ?? "", category: cat?.name ?? "", guests: res.guest_count,
    checkIn: res.check_in, checkOut: res.check_out, nights: Math.round((Date.parse(res.check_out) - Date.parse(res.check_in)) / 86_400_000),
    amountKobo: balance, heldUntil: res.status === "pending_payment" ? res.hold_expires_at : null, needsEmail: !guest?.email,
  };
}

/** The guest's public token for a usable link, after saving an email if the booking had none (Paystack needs one). */
export async function tokenForPayment(db: Db, code: string, email: string | null): Promise<string> {
  const view = await payLinkView(db, code);
  if (view.state === "paid") throw new AppError("INVALID_TRANSITION", "This booking is already paid.");
  if (view.state === "closed") throw new AppError("UNAVAILABLE", "This payment link has ended. Ask the hotel for a new one.");
  const l = (await first<{ reservation_id: string }>(db, "SELECT reservation_id FROM pay_links WHERE code = ?", code))!;
  if (view.needsEmail) {
    const e = email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw new AppError("VALIDATION", "Enter your email address for the receipt.", { fieldErrors: { email: ["Enter a valid email"] } });
    await db.prepare("UPDATE guests SET email = ? WHERE id = (SELECT guest_id FROM reservations WHERE id = ?) AND email IS NULL").bind(e, l.reservation_id).run().catch(() => {
      throw new AppError("CONFLICT", "That email belongs to another guest record. Use a different one, or call the hotel.");
    });
  }
  return (await first<{ public_token: string }>(db, "SELECT public_token FROM reservations WHERE id = ?", l.reservation_id))!.public_token;
}

// ---------------------------------------------------------------------------
// Company bills paid online (FUNCTIONALITY.md section 11)
// ---------------------------------------------------------------------------

/** A payment link for what's still owed on a company bill; it ends at the bill's valid-until date. */
export async function createBillPayLink(db: Db, actor: Actor, billId: string, siteUrl: string): Promise<{ code: string; url: string; amountKobo: number }> {
  if (!actor || !can(actor.role, "bills.manage")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  const bill = await getBill(db, actor, billId);
  if (!bill) throw new AppError("NOT_FOUND", "Bill not found.");
  if (bill.cancelledAt) throw new AppError("INVALID_TRANSITION", "This bill was cancelled.");
  if (bill.owedKobo <= 0) throw new AppError("VALIDATION", "Nothing is owed on this bill.");
  const expiresAt = hotelInstant(bill.validUntil, "23:59:00");
  if (expiresAt <= new Date().toISOString()) throw new AppError("UNAVAILABLE", "This bill's valid-until date has passed. Make a new bill.");
  const code = newToken();
  await writeBatch(db, actor, [
    db.prepare("UPDATE pay_links SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE bill_id = ? AND cancelled_at IS NULL AND paid_payment_id IS NULL").bind(bill.id),
    db.prepare("INSERT INTO pay_links (code, bill_id, amount_kobo, expires_at, created_by) VALUES (?, ?, ?, ?, ?)").bind(code, bill.id, bill.owedKobo, expiresAt, actor.id),
    activity(db, "payment.link_created", "bill", bill.id, `Payment link for bill ${bill.number} (${formatNaira(bill.owedKobo)})`, { amount_kobo: bill.owedKobo }),
  ]);
  return { code, url: `${siteUrl.replace(/\/$/, "")}/pay/${code}`, amountKobo: bill.owedKobo };
}

export type BillLinkView =
  | { state: "open"; number: string; company: string; references: string[]; amountKobo: number; validUntil: string }
  | { state: "paid"; number: string }
  | { state: "closed"; reason: "expired" | "cancelled" | "unknown" };

/** The pay page for a bill link. Paid = nothing left owed on the bill. */
export async function billLinkView(db: Db, code: string): Promise<BillLinkView | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const l = await first<{ bill_id: string | null; expires_at: string; cancelled_at: string | null }>(db, "SELECT bill_id, expires_at, cancelled_at FROM pay_links WHERE code = ?", code);
  if (!l?.bill_id) return null;
  const bill = await getBill(db, { id: "system", role: "owner" }, l.bill_id);
  if (!bill) return { state: "closed", reason: "unknown" };
  if (bill.owedKobo <= 0) return { state: "paid", number: bill.number };
  if (l.cancelled_at || bill.cancelledAt) return { state: "closed", reason: "cancelled" };
  if (l.expires_at <= new Date().toISOString()) return { state: "closed", reason: "expired" };
  return { state: "open", number: bill.number, company: bill.companyName, references: bill.references, amountKobo: bill.owedKobo, validUntil: bill.validUntil };
}

/**
 * Starts the Paystack payment for a bill link: one pending payment per booking still owed (the charge's reference
 * + "-1", "-2"…), and the charge's reference kept on the link. When Paystack says it's paid, each booking's
 * payment is settled by the usual rules and gets its own receipt.
 */
export async function beginBillPayment(db: Db, code: string, email: string | null): Promise<{ reference: string; amountKobo: number; email: string; billNumber: string }> {
  const view = await billLinkView(db, code);
  if (!view || view.state === "closed") throw new AppError("UNAVAILABLE", "This payment link has ended. Ask the hotel for a new one.");
  if (view.state === "paid") throw new AppError("INVALID_TRANSITION", "This bill is already paid.");
  const e = email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw new AppError("VALIDATION", "Enter an email address for the receipts.", { fieldErrors: { email: ["Enter a valid email"] } });
  const l = (await first<{ bill_id: string }>(db, "SELECT bill_id FROM pay_links WHERE code = ?", code))!;
  const bill = (await getBill(db, { id: "system", role: "owner" }, l.bill_id))!;
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  const reference = `bill-${bill.number.toLowerCase()}-${hex}`;
  const stmts = [];
  let total = 0;
  let i = 0;
  for (const rid of bill.reservationIds) {
    const res = await loadReservation(db, rid);
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) continue;
    const owed = dueOf(res) - (await netPaid(db, rid));
    if (owed <= 0) continue;
    i += 1;
    total += owed;
    stmts.push(db.prepare("INSERT INTO payments (id, reservation_id, amount_kobo, provider, provider_reference, status, notes) VALUES (?, ?, ?, 'paystack', ?, 'pending', ?)").bind(uuid(), rid, owed, `${reference}-${i}`, `Company bill ${bill.number}`));
  }
  if (!total) throw new AppError("INVALID_TRANSITION", "This bill is already paid.");
  await writeBatch(db, null, [
    ...stmts,
    db.prepare("UPDATE pay_links SET paystack_reference = ? WHERE code = ?").bind(reference, code),
    activity(db, "payment.started", "bill", bill.id, `Online payment started for bill ${bill.number} (${formatNaira(total)})`, { provider_reference: reference, amount_kobo: total }),
  ]);
  return { reference, amountKobo: total, email: e, billNumber: bill.number };
}

/** The per-booking payments of a bill's Paystack charge, or null if the reference isn't a bill's. */
export async function billChargeParts(db: Db, reference: string): Promise<{ code: string; parts: { reference: string; amountKobo: number }[] } | null> {
  const l = await first<{ code: string }>(db, "SELECT code FROM pay_links WHERE paystack_reference = ?", reference);
  if (!l) return null;
  const parts = await all<{ reference: string; amountKobo: number }>(
    db,
    "SELECT provider_reference AS reference, amount_kobo AS amountKobo FROM payments WHERE provider = 'paystack' AND provider_reference LIKE ? ORDER BY provider_reference",
    `${reference}-%`,
  );
  return { code: l.code, parts };
}
