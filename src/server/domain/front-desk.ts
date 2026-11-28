// Walk-in, check-in with a registration card, check-out and refund requests (FUNCTIONALITY.md sections 4–7).

import { can } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { addDays, hotelToday, hotelDateOf, nightsBetween, tonight } from "@/lib/hotel-date";
import { localDigits } from "@/lib/phone";
import { dbErrorToken } from "../db-errors";
import { activity, all, assertVersion, first, retryOnStale, uuid, writeBatch, type Actor, type Db, type Stmt } from "../db";
import { freeUnits } from "./inventory";
import { checkDetails, duplicateError, duplicateWarning, type Method } from "./payment-details";
import { checkInReservation, dueOf, generateReference, loadReservation, netPaid, type ReservationRow } from "./reservations";

const naira = formatNaira;

// ---------------------------------------------------------------------------
// Registration card (section 5)
// ---------------------------------------------------------------------------

export const ID_TYPES = { nin: "National ID (NIN)", passport: "Passport", drivers_licence: "Driver's licence", voters_card: "Voter's card", other: "Other ID" } as const;
export const PURPOSES = { business: "Business", leisure: "Leisure", family: "Family visit", event: "Event", other: "Other" } as const;
export type IdType = keyof typeof ID_TYPES;
export type Purpose = keyof typeof PURPOSES;

export type RegistrationInput = {
  idType: string;
  /** Only the last 4 characters are ever sent; the screen never sends the full number. */
  idLast4: string;
  address: string;
  comingFrom: string;
  nationality: string;
  purpose: string;
  rulesAccepted: boolean;
};
type Registration = { idType: IdType; idLast4: string; address: string; comingFrom: string; nationality: string; purpose: Purpose };

/** Keeps only the last 4 letters or digits of whatever was typed (rule: never store the full ID number). */
export const last4 = (typed: string) => typed.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(-4);

function checkRegistration(r: RegistrationInput): Registration {
  const fieldErrors: Record<string, string[]> = {};
  if (!(r.idType in ID_TYPES)) fieldErrors.idType = ["Choose the ID type"];
  const id4 = last4(r.idLast4 ?? "");
  if (id4.length !== 4) fieldErrors.idLast4 = ["Enter the ID number"];
  const address = r.address?.trim() ?? "";
  if (address.length < 3) fieldErrors.address = ["Enter the home address"];
  const comingFrom = r.comingFrom?.trim() ?? "";
  if (comingFrom.length < 2) fieldErrors.comingFrom = ["Where they're coming from"];
  const nationality = r.nationality?.trim() ?? "";
  if (nationality.length < 2) fieldErrors.nationality = ["Enter the nationality"];
  if (!(r.purpose in PURPOSES)) fieldErrors.purpose = ["Choose the purpose of stay"];
  if (r.rulesAccepted !== true) fieldErrors.rulesAccepted = ["The guest must see the house rules and check-out time"];
  if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION", "Complete the registration card.", { fieldErrors });
  return { idType: r.idType as IdType, idLast4: id4, address: address.slice(0, 200), comingFrom: comingFrom.slice(0, 80), nationality: nationality.slice(0, 60), purpose: r.purpose as Purpose };
}

const registrationStmt = (db: Db, reservationId: string, reg: Registration, staffId: string) =>
  db
    .prepare(
      `INSERT INTO guest_registrations (reservation_id, id_type, id_last4, address, coming_from, nationality, purpose, rules_accepted_at, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
       ON CONFLICT (reservation_id) DO UPDATE SET id_type = excluded.id_type, id_last4 = excluded.id_last4, address = excluded.address,
         coming_from = excluded.coming_from, nationality = excluded.nationality, purpose = excluded.purpose,
         rules_accepted_at = excluded.rules_accepted_at, recorded_by = excluded.recorded_by`,
    )
    .bind(reservationId, reg.idType, reg.idLast4, reg.address, reg.comingFrom, reg.nationality, reg.purpose, staffId);

export type SavedRegistration = { idType: IdType; idLast4: string; address: string; comingFrom: string; nationality: string; purpose: Purpose; at: string };

/** The card for this stay, else the guest's last one (a returning guest: staff confirm it). */
export async function registrationFor(db: Db, actor: Actor, reservationId: string): Promise<{ card: SavedRegistration | null; fromEarlierStay: boolean }> {
  if (!actor || !can(actor.role, "reservations.manage")) throw new AppError("FORBIDDEN", "Your role can't do this.");
  const cols = "g.id_type AS idType, g.id_last4 AS idLast4, g.address, g.coming_from AS comingFrom, g.nationality, g.purpose, g.created_at AS at";
  const own = await first<SavedRegistration>(db, `SELECT ${cols} FROM guest_registrations g WHERE g.reservation_id = ?`, reservationId);
  if (own) return { card: own, fromEarlierStay: false };
  const earlier = await first<SavedRegistration>(
    db,
    `SELECT ${cols} FROM guest_registrations g JOIN reservations r ON r.id = g.reservation_id
     WHERE r.guest_id = (SELECT guest_id FROM reservations WHERE id = ?) ORDER BY g.created_at DESC LIMIT 1`,
    reservationId,
  );
  return { card: earlier, fromEarlierStay: Boolean(earlier) };
}

/** Check in (X2): the registration card is required, and saved in the same step as the check-in. */
export async function checkInWithCard(db: Db, actor: Actor, reservationId: string, card: RegistrationInput): Promise<{ undoId: number | null }> {
  if (!actor || !can(actor.role, "reservations.manage")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  const reg = checkRegistration(card);
  return checkInReservation(db, actor, reservationId, { extra: [registrationStmt(db, reservationId, reg, actor.id)] });
}

// ---------------------------------------------------------------------------
// Walk-in (section 4)
// ---------------------------------------------------------------------------

/** +234 and the 10 digits after the leading 0. */
export function normalisePhone(typed: string): string | null {
  const d = localDigits(typed);
  if (/^0\d{10}$/.test(d)) return `+234${d.slice(1)}`;
  if (/^\d{7,15}$/.test(d)) return `+${d}`;
  return null;
}

export type WalkInInput = {
  requestId: string;
  guestId?: string | null;
  fullName: string;
  phone: string;
  nights: number;
  guests: number;
  categoryId: string;
  /** Pay and check in: the room and the payment. Omitted for "Save without paying". */
  roomId?: string | null;
  payment?: { method: Method; reference?: string | null; senderName?: string | null; slipLast4?: string | null; terminal?: string | null; confirmReceived: boolean; duplicateOk?: boolean } | null;
  card?: RegistrationInput | null;
};

/**
 * One screen from guest to checked in (X1). Pay and check in is one D1 batch: guest, booking, payment (with its
 * receipt), room, check-in and registration card. If anything fails, nothing is created. Two desks taking the same
 * room at once: the database refuses the second ("Room 103 was just taken").
 * Save without paying: an unpaid walk-in booking held for walkin_hold_hours (default 6); no room until it's paid.
 */
export async function walkIn(db: Db, actor: Actor, v: WalkInInput): Promise<{ id: string; reference: string; receiptNumber: string | null; checkedIn: boolean }> {
  if (!actor || !can(actor.role, "reservations.manage")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  const done = await first<{ reference: string; status: string; created_by: string | null }>(db, "SELECT reference, status, created_by FROM reservations WHERE id = ?", v.requestId);
  if (done) {
    if (done.created_by !== actor.id) throw new AppError("CONFLICT", "This form was already used. Reload and try again.");
    const r = await first<{ receipt_number: string }>(db, "SELECT receipt_number FROM payments WHERE reservation_id = ? AND receipt_number IS NOT NULL ORDER BY created_at LIMIT 1", v.requestId);
    return { id: v.requestId, reference: done.reference, receiptNumber: r?.receipt_number ?? null, checkedIn: done.status === "checked_in" };
  }

  const phone = normalisePhone(v.phone ?? "");
  if (!phone) throw new AppError("VALIDATION", "Enter the guest's phone number, all 11 digits.", { fieldErrors: { phone: ["Enter all 11 digits"] } });
  const fullName = v.fullName?.trim() ?? "";
  if (!v.guestId && fullName.length < 2) throw new AppError("VALIDATION", "Enter the guest's full name.", { fieldErrors: { fullName: ["Enter the full name"] } });
  if (v.guestId && !(await first(db, "SELECT 1 FROM guests WHERE id = ?", v.guestId))) throw new AppError("NOT_FOUND", "Guest not found.");
  if (!Number.isInteger(v.nights) || v.nights < 1 || v.nights > 30) throw new AppError("VALIDATION", "Choose 1 to 30 nights.", { fieldErrors: { nights: ["1 to 30"] } });
  const cat = await first<{ id: string; name: string; nightly_rate_kobo: number; max_occupancy: number; is_active: number }>(
    db,
    "SELECT id, name, nightly_rate_kobo, max_occupancy, is_active FROM room_categories WHERE id = ?",
    v.categoryId,
  );
  if (!cat || !cat.is_active) throw new AppError("NOT_FOUND", "Choose a room type.");
  if (!Number.isInteger(v.guests) || v.guests < 1 || v.guests > cat.max_occupancy) throw new AppError("VALIDATION", `${cat.name} sleeps up to ${cat.max_occupancy}.`, { fieldErrors: { guests: [`Up to ${cat.max_occupancy}`] } });
  const checkIn = tonight();
  const checkOut = addDays(checkIn, v.nights);
  if ((await freeUnits(db, cat.id, checkIn, checkOut)) <= 0) throw new AppError("UNAVAILABLE", `${cat.name} is full for those nights. Choose another room type.`);
  const total = cat.nightly_rate_kobo * v.nights;

  const id = v.requestId;
  const reference = generateReference();
  const stmts: Stmt[] = [];
  let guestId = v.guestId ?? null;
  if (!guestId) {
    guestId = uuid();
    stmts.push(db.prepare("INSERT INTO guests (id, full_name, phone) VALUES (?, ?, ?)").bind(guestId, fullName, phone));
  }

  if (!v.payment) {
    const hours = (await first<{ h: number }>(db, "SELECT walkin_hold_hours AS h FROM hotel_settings WHERE id = 1"))?.h ?? 6;
    stmts.push(
      db
        .prepare(
          `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'walk_in', ?, ?)`,
        )
        .bind(id, reference, uuid(), guestId, cat.id, checkIn, checkOut, v.guests, cat.nightly_rate_kobo, total, new Date(Date.now() + hours * 3_600_000).toISOString(), actor.id),
      activity(db, "reservation.created", "reservation", id, `Walk-in ${reference} saved without payment: ${cat.name}, ${v.nights} night${v.nights === 1 ? "" : "s"}, held ${hours} hours`, { source: "walk_in", total_kobo: total }),
    );
    await writeBatch(db, actor, stmts).catch((err: unknown) => rethrowWalkIn(err, cat.name));
    return { id, reference, receiptNumber: null, checkedIn: false };
  }

  // Pay and check in.
  if (!v.roomId) throw new AppError("VALIDATION", "Choose the room.", { fieldErrors: { roomId: ["Choose a room"] } });
  const room = await first<{ id: string; room_number: string; category_id: string; service_status: string; readiness: string; is_active: number; version: number }>(
    db,
    "SELECT id, room_number, category_id, service_status, readiness, is_active, version FROM rooms WHERE id = ?",
    v.roomId,
  );
  if (!room || !room.is_active || room.category_id !== cat.id) throw new AppError("VALIDATION", `Choose a ${cat.name} room.`, { fieldErrors: { roomId: ["Choose a room"] } });
  if (room.service_status !== "in_service" || room.readiness !== "ready") throw new AppError("UNAVAILABLE", `Room ${room.room_number} isn't clean and ready. Choose another.`, { fieldErrors: { roomId: ["Not ready"] } });
  if (v.payment.confirmReceived !== true) throw new AppError("VALIDATION", "Confirm the money has arrived before checking the guest in.");
  const details = await checkDetails(db, { ...v.payment, seenInBankApp: v.payment.confirmReceived });
  if (!v.payment.duplicateOk) {
    const dup = await duplicateWarning(db, v.payment.method, details, total);
    if (dup) throw duplicateError(dup);
  }
  const reg = checkRegistration(v.card ?? ({} as RegistrationInput));
  const paymentId = uuid();
  stmts.push(
    assertVersion(db, "rooms", room.id, room.version),
    db
      .prepare(
        `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'walk_in', ?, ?)`,
      )
      .bind(id, reference, uuid(), guestId, cat.id, checkIn, checkOut, v.guests, cat.nightly_rate_kobo, total, new Date(Date.now() + 3_600_000).toISOString(), actor.id),
    db
      .prepare(
        `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, sender_name, slip_last4, terminal, seen_in_bank_app, status, paid_at, verified_at, recorded_by)
         VALUES (?, ?, ?, 'offline', ?, ?, ?, ?, ?, ?, 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)`,
      )
      .bind(paymentId, id, total, v.payment.method, details.reference, details.senderName, details.slipLast4, details.terminal, details.seenInBankApp ? 1 : 0, actor.id),
    db.prepare("UPDATE reservations SET status = 'confirmed', room_id = ? WHERE id = ?").bind(room.id, id),
    db.prepare("UPDATE reservations SET status = 'checked_in' WHERE id = ?").bind(id),
    registrationStmt(db, id, reg, actor.id),
    activity(db, "reservation.created", "reservation", id, `Walk-in ${reference}: ${cat.name}, ${v.nights} night${v.nights === 1 ? "" : "s"}, paid ${naira(total)} and checked in to room ${room.room_number}`, {
      source: "walk_in",
      total_kobo: total,
      payment_id: paymentId,
    }),
  );
  await writeBatch(db, actor, stmts).catch((err: unknown) => rethrowWalkIn(err, cat.name, room.room_number));
  const receipt = await first<{ receipt_number: string }>(db, "SELECT receipt_number FROM payments WHERE id = ?", paymentId);
  return { id, reference, receiptNumber: receipt?.receipt_number ?? null, checkedIn: true };
}

function rethrowWalkIn(err: unknown, type: string, roomNumber?: string): never {
  const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
  if (roomNumber && (token === "room_overlap" || (err instanceof Error && err.name === "StaleStateError"))) {
    throw new AppError("CONFLICT", `Room ${roomNumber} was just taken. Choose another room.`, { fieldErrors: { roomId: ["Just taken"] } });
  }
  if (token === "no_capacity") throw new AppError("UNAVAILABLE", `${type} was just booked up for those nights. Choose another room type.`);
  throw err;
}

// ---------------------------------------------------------------------------
// Check-out (section 6)
// ---------------------------------------------------------------------------

/**
 * Check out (X3): the key-returned tick; the room goes to cleaning. A balance must be paid, or a manager with
 * payments.override leaves it owing with a reason (it stays under Owed).
 */
export async function checkOutGuest(
  db: Db,
  actor: Actor,
  reservationId: string,
  v: { keyReturned: boolean; leaveOwingReason?: string | null },
): Promise<{ balance: number; undoId: number | null }> {
  if (!actor || !can(actor.role, "reservations.manage")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  if (v.keyReturned !== true) throw new AppError("VALIDATION", "Get the key back first, then tick Key returned.", { fieldErrors: { keyReturned: ["Tick once the key is back"] } });
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "checked_in") throw new AppError("INVALID_TRANSITION", "Only checked-in guests can be checked out.");
    const balance = dueOf(res) - (await netPaid(db, res.id));
    const why = v.leaveOwingReason?.trim() || null;
    if (balance > 0) {
      if (!why) throw new AppError("VALIDATION", `${naira(balance)} owed. Take the payment, or a manager can leave it owing with a reason.`, { fieldErrors: { leaveOwingReason: ["Take the payment or give a reason"] } });
      if (!can(actor.role, "payments.override")) throw new AppError("FORBIDDEN", "Only a manager can let a guest leave owing. Take the payment, or ask the General Manager.");
      if (why.length < 5) throw new AppError("VALIDATION", "Say why the guest is leaving owing.", { fieldErrors: { leaveOwingReason: ["Say why"] } });
    }
    const results = await writeBatch(db, actor, [
      assertVersion(db, "reservations", res.id, res.version),
      balance > 0
        ? db
            .prepare("UPDATE reservations SET status = 'checked_out', left_owing_by = ?, left_owing_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), left_owing_reason = ? WHERE id = ?")
            .bind(actor.id, why!.slice(0, 300), res.id)
        : db.prepare("UPDATE reservations SET status = 'checked_out' WHERE id = ?").bind(res.id),
      db.prepare("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?").bind(res.room_id),
      activity(db, "reservation.checked_out", "reservation", res.id, `${res.reference} checked out, key returned${balance > 0 ? `, left owing ${naira(balance)}: ${why}` : ""}`, {
        balance_kobo: balance,
        room_id: res.room_id,
        previous_room_readiness: "ready",
      }),
    ]);
    return { balance, undoId: results.at(-1)?.meta.last_row_id ?? null };
  });
}

// ---------------------------------------------------------------------------
// Refund requests (section 7: the desk asks; the GM or owner decides in Approvals)
// ---------------------------------------------------------------------------

/**
 * The most that can be refunded: what was paid minus what was used. Used = the nights stayed (at the booked rate,
 * less the discount for those nights) + extras + any upgrade charge, or the cancellation fee / first night kept
 * for a cancellation or no-show. Requests already waiting count against it.
 */
export async function refundLimit(db: Db, reservationId: string, at = new Date()): Promise<{ paid: number; used: number; pending: number; limit: number }> {
  const r = await first<ReservationRow & { cancellation_fee_kobo: number | null; checked_out_at: string | null }>(
    db,
    `SELECT id, status, check_in, check_out, nightly_rate_kobo, total_amount_kobo, extras_kobo, room_change_kobo, discount_kobo, cancellation_fee_kobo, checked_out_at
     FROM reservations WHERE id = ?`,
    reservationId,
  );
  if (!r) throw new AppError("NOT_FOUND", "Booking not found.");
  const paid = await netPaid(db, reservationId);
  const nights = nightsBetween(r.check_in, r.check_out);
  let used: number;
  if (r.status === "cancelled" || r.status === "expired") used = r.cancellation_fee_kobo ?? 0;
  else if (r.status === "no_show") used = r.cancellation_fee_kobo ?? r.nightly_rate_kobo; // policy: the first night is kept
  else if (r.status === "checked_in" || r.status === "checked_out") {
    const end = r.status === "checked_out" && r.checked_out_at ? hotelDateOf(r.checked_out_at) : addDays(hotelToday(at), 1);
    const stayed = Math.min(nights, Math.max(1, nightsBetween(r.check_in, end < r.check_out ? end : r.check_out)));
    used = r.nightly_rate_kobo * stayed - Math.round((r.discount_kobo * stayed) / nights) + r.extras_kobo + r.room_change_kobo;
  } else used = dueOf(r); // not arrived yet: only an overpayment can be refunded before it's cancelled
  const pending = (await first<{ k: number }>(db, "SELECT coalesce(sum(amount_kobo), 0) AS k FROM refund_requests WHERE reservation_id = ? AND decided_at IS NULL", reservationId))?.k ?? 0;
  return { paid, used, pending, limit: Math.max(0, paid - used - pending) };
}

export async function requestRefund(
  db: Db,
  actor: Actor,
  v: { reservationId: string; amountKobo: number; method: "bank_transfer" | "cash"; reason: string },
): Promise<string> {
  if (!actor || !can(actor.role, "refunds.request")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  if (!Number.isInteger(v.amountKobo) || v.amountKobo <= 0) throw new AppError("VALIDATION", "Enter the amount to refund.", { fieldErrors: { amount: ["Enter an amount"] } });
  if (v.method !== "bank_transfer" && v.method !== "cash") throw new AppError("VALIDATION", "Choose how the refund is paid.");
  const reason = v.reason?.trim() ?? "";
  if (reason.length < 5) throw new AppError("VALIDATION", "Say why the guest is being refunded.", { fieldErrors: { reason: ["A reason is required"] } });
  const { limit } = await refundLimit(db, v.reservationId);
  if (v.amountKobo > limit) {
    throw new AppError("VALIDATION", limit > 0 ? `At most ${naira(limit)} can be refunded: what was paid less the nights used.` : "Nothing can be refunded: everything paid has been used.", {
      fieldErrors: { amount: [`At most ${naira(limit)}`] },
    });
  }
  const id = uuid();
  await writeBatch(db, actor, [
    db.prepare("INSERT INTO refund_requests (id, reservation_id, amount_kobo, method, reason, requested_by) VALUES (?, ?, ?, ?, ?, ?)").bind(id, v.reservationId, v.amountKobo, v.method, reason.slice(0, 500), actor.id),
    activity(db, "refund.requested", "reservation", v.reservationId, `Refund of ${naira(v.amountKobo)} requested (${v.method === "cash" ? "cash" : "transfer"}): ${reason}`, { refund_id: id }),
  ]);
  return id;
}

export async function openRefundRequests(db: Db, reservationId: string) {
  return all<{ id: string; amount_kobo: number; method: string; reason: string; requested_at: string }>(
    db,
    "SELECT id, amount_kobo, method, reason, requested_at FROM refund_requests WHERE reservation_id = ? AND decided_at IS NULL ORDER BY requested_at",
    reservationId,
  );
}

export type CheckOutSummary = {
  reference: string; guestName: string; roomNumber: string | null; category: string; checkIn: string; checkOut: string; nights: number;
  chargesKobo: number; paidKobo: number; balanceKobo: number; refundLimitKobo: number; publicToken: string; phone: string | null; email: string | null;
  lastReceipt: string | null;
};

export async function checkOutSummary(db: Db, actor: Actor, reservationId: string): Promise<CheckOutSummary> {
  if (!actor || !can(actor.role, "reservations.manage")) throw new AppError("FORBIDDEN", "Your role can't do this.");
  const r = await first<{ reference: string; guest_name: string; room_number: string | null; category: string; check_in: string; check_out: string; due: number; public_token: string; phone: string | null; email: string | null }>(
    db,
    `SELECT r.reference, g.full_name AS guest_name, rm.room_number, c.name AS category, r.check_in, r.check_out,
            r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo AS due, r.public_token, g.phone, g.email
     FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN room_categories c ON c.id = r.category_id LEFT JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`,
    reservationId,
  );
  if (!r) throw new AppError("NOT_FOUND", "Booking not found.");
  const paid = await netPaid(db, reservationId);
  const receipt = await first<{ receipt_number: string }>(db, "SELECT receipt_number FROM payments WHERE reservation_id = ? AND receipt_number IS NOT NULL AND kind = 'payment' ORDER BY paid_at DESC LIMIT 1", reservationId);
  return {
    reference: r.reference, guestName: r.guest_name, roomNumber: r.room_number, category: r.category, checkIn: r.check_in, checkOut: r.check_out,
    nights: nightsBetween(r.check_in, r.check_out), chargesKobo: r.due, paidKobo: paid, balanceKobo: r.due - paid,
    refundLimitKobo: (await refundLimit(db, reservationId)).limit, publicToken: r.public_token, phone: r.phone, email: r.email, lastReceipt: receipt?.receipt_number ?? null,
  };
}
