import { stayPrice } from "@/domain/pricing";
import { AppError } from "@/lib/errors";
import { formatDate, formatNaira } from "@/lib/format";
import { hotelToday, nightsBetween } from "@/lib/hotel-date";
import { dbErrorToken } from "../db-errors";
import {
  assertNetPaid,
  activity,
  ALL_STAFF,
  all,
  assertVersion,
  first,
  MANAGERS,
  MONEY_APPROVERS,
  now,
  requireRole,
  retryOnStale,
  uuid,
  writeBatch,
  type Actor,
  type Db,
  type Stmt,
} from "../db";
import { cancellationFee, cancelRule } from "./cancellation-rule";
import { freeUnits, stayEndSql, validateStay } from "./inventory";

export type ReservationRow = {
  id: string;
  reference: string;
  public_token: string;
  guest_id: string;
  category_id: string;
  room_id: string | null;
  check_in: string;
  check_out: string;
  guest_count: number;
  nightly_rate_kobo: number;
  total_amount_kobo: number;
  status: "pending_payment" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "expired" | "no_show";
  source: "website" | "walk_in" | "phone" | "whatsapp" | "staff";
  hold_expires_at: string | null;
  attention_reason: string | null;
  version: number;
  extras_kobo: number;
  room_change_kobo: number;
  discount_pct: number;
  discount_kobo: number;
};

export const dueOf = (r: Pick<ReservationRow, "total_amount_kobo" | "extras_kobo" | "room_change_kobo" | "discount_kobo">) => r.total_amount_kobo + r.extras_kobo + r.room_change_kobo - r.discount_kobo;
export const RES_COLUMNS = `id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, attention_reason, version, extras_kobo, room_change_kobo, discount_pct, discount_kobo`;
const SELECT_RES = `SELECT ${RES_COLUMNS} FROM reservations`;

export async function loadReservation(db: Db, id: string): Promise<ReservationRow> {
  const res = await first<ReservationRow>(db, `${SELECT_RES} WHERE id = ?`, id);
  if (!res) throw new AppError("NOT_FOUND", "Booking not found.");
  return res;
}

export async function netPaid(db: Db, reservationId: string): Promise<number> {
  const row = await first<{ paid: number }>(
    db,
    `SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_kobo ELSE -amount_kobo END), 0) AS paid
     FROM payments WHERE reservation_id = ? AND status = 'successful'`,
    reservationId,
  );
  return row?.paid ?? 0;
}

const isHoldLive = (res: Pick<ReservationRow, "status" | "hold_expires_at">) =>
  res.status === "pending_payment" && !!res.hold_expires_at && res.hold_expires_at > now();

const naira = (kobo: number) => formatNaira(kobo).replace(/\s/g, "");

export function generateReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "VL-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function rethrow(err: unknown, messages: Partial<Record<string, AppError>>): never {
  const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
  const specific = token ? messages[token] : undefined;
  throw specific ?? err;
}

type CreateInput = {
  categoryId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestId?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  specialRequests?: string | null;
  extraIds?: string[];
  promoCode?: string | null;
  source: ReservationRow["source"];
  createdBy: string | null;
  holdMinutes: number;
};

export type CreatedReservation = { id: string; reference: string; publicToken: string; totalAmountKobo: number; holdExpiresAt: string };

async function createReservation(db: Db, actor: Actor, input: CreateInput): Promise<CreatedReservation> {
  validateStay(input.checkIn, input.checkOut, input.guests);
  const cat = await first<{ id: string; name: string; is_active: number; max_occupancy: number; nightly_rate_kobo: number }>(
    db,
    "SELECT id, name, is_active, max_occupancy, nightly_rate_kobo FROM room_categories WHERE id = ?",
    input.categoryId,
  );
  if (!cat || !cat.is_active) throw new AppError("NOT_FOUND", "That room type is not available for booking.");
  if (input.guests > cat.max_occupancy) throw new AppError("VALIDATION", `${cat.name} sleeps up to ${cat.max_occupancy} guests.`);
  const unavailable = new AppError("UNAVAILABLE", `Sorry, ${cat.name} is no longer available for those dates.`);
  if ((await freeUnits(db, cat.id, input.checkIn, input.checkOut)) <= 0) throw unavailable;

  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const fullName = input.fullName?.trim() ?? "";
  if (input.guestId) {
    if (!(await first(db, "SELECT 1 FROM guests WHERE id = ?", input.guestId))) throw new AppError("NOT_FOUND", "Guest not found.");
  } else if (fullName.length < 2) {
    throw new AppError("VALIDATION", "Enter the guest's full name.");
  }

  const nights = nightsBetween(input.checkIn, input.checkOut);

  const ids = [...new Set(input.extraIds ?? [])].slice(0, 20);
  const extras = ids.length
    ? await all<{ id: string; name: string; price_kobo: number; per_night: number }>(
        db,
        `SELECT id, name, price_kobo, per_night FROM extras WHERE is_active = 1 AND id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : [];
  if (extras.length !== ids.length) throw new AppError("VALIDATION", "One of the extras is no longer available. Please choose again.");

  const code = input.promoCode?.trim().toUpperCase() || null;
  const promo = code ? await validPromo(db, code) : null;
  const discountPct = promo?.percent_off ?? 0;
  // The same function the booking form uses to show the total.
  const price = stayPrice({ nightlyRateKobo: cat.nightly_rate_kobo, nights, extras: extras.map((e) => ({ priceKobo: e.price_kobo, perNight: e.per_night === 1 })), discountPct });
  const total = price.roomKobo;
  const extrasKobo = price.extrasKobo;
  const discountKobo = price.discountKobo;
  const holdExpiresAt = new Date(Date.now() + input.holdMinutes * 60_000).toISOString();

  for (let attempt = 1; ; attempt++) {
    const id = uuid();
    const reference = generateReference();
    const publicToken = uuid();
    const stmts: Stmt[] = [];
    let guestExpr = "?";
    let guestParam: string;
    if (input.guestId) {
      guestParam = input.guestId;
    } else if (email) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO guests (id, full_name, email, phone) VALUES (?, ?, ?, ?)
             ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET phone = coalesce(guests.phone, excluded.phone)`,
          )
          .bind(uuid(), fullName, email, phone),
      );
      guestExpr = "(SELECT id FROM guests WHERE email = ?)";
      guestParam = email;
    } else {
      guestParam = uuid();
      stmts.push(db.prepare("INSERT INTO guests (id, full_name, phone) VALUES (?, ?, ?)").bind(guestParam, fullName, phone));
    }
    stmts.push(
      db
        .prepare(
          `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
             nightly_rate_kobo, total_amount_kobo, status, source, special_requests, hold_expires_at, created_by,
             extras_kobo, discount_pct, discount_kobo, promo_code)
           VALUES (?, ?, ?, ${guestExpr}, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, reference, publicToken, guestParam, cat.id, null, input.checkIn, input.checkOut, input.guests,
          cat.nightly_rate_kobo, total, input.source, input.specialRequests?.trim() || null, holdExpiresAt, input.createdBy,
          extrasKobo, discountPct, discountKobo, promo ? code : null,
        ),
      ...extras.map((e) =>
        db
          .prepare("INSERT INTO reservation_extras (reservation_id, extra_id, name, unit_price_kobo, per_night) VALUES (?, ?, ?, ?, ?)")
          .bind(id, e.id, e.name, e.price_kobo, e.per_night),
      ),
      activity(db, "reservation.created", "reservation", id, `Reservation ${reference} created: ${cat.name}, ${input.checkIn} → ${input.checkOut}`, {
        source: input.source,
        total_kobo: total,
        ...(extrasKobo ? { extras_kobo: extrasKobo } : {}),
        ...(promo ? { promo_code: code, discount_kobo: discountKobo } : {}),
      }),
    );
    try {
      await writeBatch(db, actor, stmts);
      return { id, reference, publicToken, totalAmountKobo: total + extrasKobo - discountKobo, holdExpiresAt };
    } catch (err) {
      const collided = err instanceof AppError && dbErrorToken(err.cause) === "unique" && /reservations\.(reference|public_token)/.test(String((err.cause as Error)?.message));
      if (collided && attempt < 3) continue;
      rethrow(err, { no_capacity: unavailable, promo_invalid: new AppError("VALIDATION", "That promo code can no longer be used."), room_overlap: new AppError("CONFLICT", "That room was just booked for some of these nights. Choose another.") });
    }
  }
}

export async function createWebsiteReservation(
  db: Db,
  input: {
    categorySlug: string; checkIn: string; checkOut: string; guests: number; fullName: string; email: string; phone: string;
    specialRequests?: string | null; extraIds?: string[]; promoCode?: string | null;
  },
): Promise<CreatedReservation> {
  const cat = await first<{ id: string }>(db, "SELECT id FROM room_categories WHERE slug = ?", input.categorySlug);
  if (!cat) throw new AppError("NOT_FOUND", "That room type is not available for booking.");
  if (!input.email?.trim() || !input.phone?.trim()) throw new AppError("VALIDATION", "An email address and phone number are required.");
  const settings = await first<{ website_hold_minutes: number }>(db, "SELECT website_hold_minutes FROM hotel_settings WHERE id = 1");
  return createReservation(db, null, {
    ...input,
    categoryId: cat.id,
    source: "website",
    createdBy: null,
    holdMinutes: settings?.website_hold_minutes ?? 30,
  });
}

export async function createStaffReservation(
  db: Db,
  actor: Actor,
  input: Omit<CreateInput, "createdBy" | "holdMinutes" | "source"> & { source: Exclude<ReservationRow["source"], "website"> | "website" },
): Promise<{ id: string; reference: string }> {
  requireRole(actor, ALL_STAFF);
  if (input.source === "website") throw new AppError("VALIDATION", "Choose how this booking was received.");
  const settings = await first<{ staff_hold_hours: number }>(db, "SELECT staff_hold_hours FROM hotel_settings WHERE id = 1");
  const res = await createReservation(db, actor, { ...input, createdBy: actor.id, holdMinutes: (settings?.staff_hold_hours ?? 24) * 60 });
  return { id: res.id, reference: res.reference };
}

type RoomRow = { id: string; room_number: string; category_id: string; service_status: string; readiness: string; is_active: number; version: number };
const loadRoom = (db: Db, id: string) =>
  first<RoomRow>(db, "SELECT id, room_number, category_id, service_status, readiness, is_active, version FROM rooms WHERE id = ?", id);

const categoryRate = async (db: Db, categoryId: string) =>
  (await first<{ nightly_rate_kobo: number }>(db, "SELECT nightly_rate_kobo FROM room_categories WHERE id = ?", categoryId))?.nightly_rate_kobo ?? 0;

/** What moving this stay into a room of `toCategory` costs extra: the higher nightly rate for the nights left. Never a refund. */
export async function roomChangeCharge(db: Db, res: Pick<ReservationRow, "room_id" | "category_id" | "nightly_rate_kobo" | "check_in" | "check_out">, toCategory: string): Promise<{ perNight: number; nights: number; kobo: number }> {
  const current = res.room_id ? ((await loadRoom(db, res.room_id))?.category_id ?? res.category_id) : res.category_id;
  if (current === toCategory) return { perNight: 0, nights: 0, kobo: 0 };
  const paying = Math.max(res.nightly_rate_kobo, await categoryRate(db, current));
  const perNight = Math.max(0, (await categoryRate(db, toCategory)) - paying);
  const from = res.check_in > hotelToday() ? res.check_in : hotelToday();
  const nights = Math.max(0, nightsBetween(from, res.check_out));
  return { perNight, nights, kobo: perNight * nights };
}

/** What a room move writes: the room, any extra charge, the old room to cleaning if the guest is in house, and the activity line. */
export function roomMoveStatements(
  db: Db,
  res: Pick<ReservationRow, "id" | "reference" | "status" | "room_id">,
  room: Pick<RoomRow, "id" | "room_number">,
  oldRoom: Pick<RoomRow, "readiness"> | null,
  chargeKobo: number,
  note = "",
): Stmt[] {
  const stmts = [db.prepare("UPDATE reservations SET room_id = ?, room_change_kobo = room_change_kobo + ? WHERE id = ?").bind(room.id, chargeKobo, res.id)];
  if (res.status === "checked_in" && res.room_id) stmts.push(db.prepare("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?").bind(res.room_id));
  stmts.push(
    activity(db, "reservation.room_assigned", "reservation", res.id, `Room ${room.room_number} assigned to ${res.reference}${chargeKobo ? ` (${naira(chargeKobo)} paid)` : ""}${note}`, {
      room_id: room.id,
      previous_room_id: res.room_id,
      previous_room_readiness: oldRoom?.readiness ?? null,
      charge_kobo: chargeKobo,
    }),
  );
  return stmts;
}

export type ChangeRequest = { kind: "room"; roomId: string; amountKobo: number; description: string } | { kind: "dates"; checkIn: string; checkOut: string; amountKobo: number; description: string };

/** Records a change that costs more as waiting for payment. One at a time per booking. */
async function requestChange(db: Db, actor: Actor, res: Pick<ReservationRow, "id" | "reference">, c: ChangeRequest): Promise<string> {
  const waiting = await first<{ description: string; amount_kobo: number }>(db, "SELECT description, amount_kobo FROM reservation_changes WHERE reservation_id = ? AND status = 'pending'", res.id);
  if (waiting) {
    throw new AppError("CONFLICT", `This booking already has a change waiting for payment: ${waiting.description} (${naira(waiting.amount_kobo)}). Take that payment or cancel the change first.`);
  }
  const changeId = uuid();
  try {
    await writeBatch(db, actor, [
      db
        .prepare(
          `INSERT INTO reservation_changes (id, reservation_id, kind, room_id, check_in, check_out, amount_kobo, description, requested_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(changeId, res.id, c.kind, c.kind === "room" ? c.roomId : null, c.kind === "dates" ? c.checkIn : null, c.kind === "dates" ? c.checkOut : null, c.amountKobo, c.description, actor?.id ?? null),
      activity(db, "reservation.change_requested", "reservation", res.id, `${res.reference}: ${c.description}. ${naira(c.amountKobo)} to pay before it takes effect`, {
        change_id: changeId,
        amount_kobo: c.amountKobo,
      }),
    ]);
  } catch (err) {
    if (dbErrorToken(err instanceof AppError ? err.cause : err) === "unique") throw new AppError("CONFLICT", "Someone just asked for another change on this booking. Reload to see it.");
    throw err;
  }
  return changeId;
}

export async function assignRoom(
  db: Db,
  actor: Actor,
  reservationId: string,
  roomId: string,
  opts: { waiveCharge?: boolean } = {},
): Promise<{ undoId: number | null; chargeKobo: number; pendingChangeId?: string }> {
  requireRole(actor, ALL_STAFF);
  if (opts.waiveCharge && !MONEY_APPROVERS.includes(actor.role as (typeof MONEY_APPROVERS)[number])) throw new AppError("FORBIDDEN", "Only the general manager or owner can give a free upgrade.");
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status === "pending_payment") {
      throw new AppError("VALIDATION", "This booking isn't paid yet. Take the payment first: a room is given automatically once it's paid.");
    }
    if (res.status !== "confirmed" && res.status !== "checked_in") {
      throw new AppError("INVALID_TRANSITION", "A room can only be given to a booking that hasn't ended.");
    }
    const room = await loadRoom(db, roomId);
    if (!room || !room.is_active) throw new AppError("NOT_FOUND", "Room not found.");
    if (room.service_status !== "in_service") throw new AppError("UNAVAILABLE", `Room ${room.room_number} is under maintenance.`);
    if (res.room_id === roomId) return { undoId: null, chargeKobo: 0 };
    const occupant = await first<{ full_name: string; check_out: string }>(
      db,
      `SELECT g.full_name, o.check_out FROM reservations o JOIN guests g ON g.id = o.guest_id
       WHERE o.room_id = ? AND o.id <> ? AND o.status = 'checked_in' AND o.check_in < ? AND ? < ${stayEndSql("o")}`,
      roomId,
      res.id,
      res.check_out,
      res.check_in,
    );
    if (occupant) {
      const overdue = occupant.check_out < hotelToday() ? `, due out ${formatDate(occupant.check_out, { year: false })}` : "";
      throw new AppError("CONFLICT", `Room ${room.room_number} is occupied: ${occupant.full_name} is checked in${overdue}. Check them out first, or choose another room.`);
    }
    if (res.status === "checked_in" && room.readiness !== "ready") throw new AppError("UNAVAILABLE", `Room ${room.room_number} isn't clean yet. Mark it ready first.`);

    const oldRoom = res.room_id ? await loadRoom(db, res.room_id) : null;
    const currentCategory = oldRoom?.category_id ?? res.category_id;
    if (room.category_id !== currentCategory) {
      const from = res.check_in > hotelToday() ? res.check_in : hotelToday();
      if ((await freeUnits(db, room.category_id, from, res.check_out, res.id)) <= 0) {
        const cat = await first<{ name: string }>(db, "SELECT name FROM room_categories WHERE id = ?", room.category_id);
        throw new AppError("UNAVAILABLE", cat ? `No ${cat.name} rooms are free on all of these nights.` : "No rooms of that type are free on all of these nights.");
      }
    }

    const charge = opts.waiveCharge ? { perNight: 0, nights: 0, kobo: 0 } : await roomChangeCharge(db, res, room.category_id);
    if (charge.kobo > 0) {
      // Money first: a move that costs more waits for its payment (rules 2.1). Taking that payment applies it.
      const cat = await first<{ name: string }>(db, "SELECT name FROM room_categories WHERE id = ?", room.category_id);
      const description = `${oldRoom ? `Move from Room ${oldRoom.room_number} to` : "Upgrade to"} Room ${room.room_number}${cat ? ` (${cat.name})` : ""}: ${charge.nights} night${charge.nights === 1 ? "" : "s"} × ${naira(charge.perNight)}`;
      const pendingChangeId = await requestChange(db, actor, res, { kind: "room", roomId, amountKobo: charge.kobo, description });
      return { undoId: null, chargeKobo: charge.kobo, pendingChangeId };
    }
    const stmts = [
      assertVersion(db, "reservations", res.id, res.version),
      ...roomMoveStatements(db, res, room, oldRoom, 0, opts.waiveCharge ? " (free upgrade)" : ""),
    ];
    try {
      const results = await writeBatch(db, actor, stmts);
      return { undoId: results.at(-1)?.meta.last_row_id ?? null, chargeKobo: charge.kobo };
    } catch (err) {
      rethrow(err, {
        room_overlap: new AppError("CONFLICT", `Room ${room.room_number} is already booked for some of these nights.`),
        no_capacity: new AppError("UNAVAILABLE", "No rooms of that type are free on all of these nights."),
      });
    }
  });
}

export async function checkInReservation(db: Db, actor: Actor, reservationId: string): Promise<{ undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "confirmed") {
      throw new AppError(
        "INVALID_TRANSITION",
        res.status === "pending_payment"
          ? "This booking is awaiting payment. Take the full payment first."
          : res.status === "checked_in"
            ? "This guest is already checked in."
            : "Only confirmed bookings can be checked in.",
      );
    }
    const today = hotelToday();
    if (res.check_in > today) throw new AppError("VALIDATION", `This guest arrives on ${formatDate(res.check_in, { year: false })}. Check-in opens that day.`);
    const owed = dueOf(res) - (await netPaid(db, res.id));
    if (owed > 0) throw new AppError("VALIDATION", `${naira(owed)} owed. Take the payment before check-in.`);
    if (res.check_out <= today) throw new AppError("VALIDATION", "This stay has already ended.");
    if (!res.room_id) throw new AppError("VALIDATION", "Assign a room before checking in.");
    const room = (await loadRoom(db, res.room_id))!;
    if (room.service_status !== "in_service") throw new AppError("UNAVAILABLE", `Room ${room.room_number} is under maintenance. Assign another room.`);
    if (room.readiness !== "ready") throw new AppError("UNAVAILABLE", `Room ${room.room_number} is not marked ready yet.`);

    const results = await writeBatch(db, actor, [
      assertVersion(db, "reservations", res.id, res.version),
      assertVersion(db, "rooms", room.id, room.version),
      db.prepare("UPDATE reservations SET status = 'checked_in' WHERE id = ?").bind(res.id),
      activity(db, "reservation.checked_in", "reservation", res.id, `${res.reference} checked in to room ${room.room_number}`),
    ]);
    return { undoId: results.at(-1)?.meta.last_row_id ?? null };
  });
}

export async function checkOutReservation(db: Db, actor: Actor, reservationId: string): Promise<{ balance: number; undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "checked_in") throw new AppError("INVALID_TRANSITION", "Only checked-in guests can be checked out.");
    const balance = dueOf(res) - (await netPaid(db, res.id));
    if (balance > 0) throw new AppError("VALIDATION", `${naira(balance)} owed. Take the payment before check-out.`);
    const room = res.room_id ? await loadRoom(db, res.room_id) : null;
    const results = await writeBatch(db, actor, [
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET status = 'checked_out' WHERE id = ?").bind(res.id),
      db.prepare("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?").bind(res.room_id),
      activity(db, "reservation.checked_out", "reservation", res.id, `${res.reference} checked out${balance > 0 ? ` with ${naira(balance)} outstanding` : ""}`, {
        balance_kobo: balance,
        room_id: res.room_id,
        previous_room_readiness: room?.readiness ?? null,
      }),
    ]);
    return { balance, undoId: results.at(-1)?.meta.last_row_id ?? null };
  });
}

export async function cancelReservation(db: Db, actor: Actor, reservationId: string, reason: string): Promise<void> {
  requireRole(actor, ALL_STAFF);
  const why = (reason ?? "").trim();
  if (why.length < 3) throw new AppError("VALIDATION", "Give a reason for the cancellation.");
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "pending_payment" && res.status !== "confirmed") throw new AppError("INVALID_TRANSITION", "Only a booking that hasn't started can be cancelled. For a guest already in house, change the check-out date instead.");
    const paid = await netPaid(db, res.id);
    const fee = paid > 0 ? Math.min(paid, cancellationFee(res.total_amount_kobo, res.check_in, await cancelRule(db))) : 0;
    const refund = Math.max(0, paid - fee);
    const stmts = [
      assertNetPaid(db, res.id, paid),
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET status = 'cancelled', cancellation_reason = ?, cancellation_fee_kobo = ? WHERE id = ?").bind(why, paid > 0 ? fee : null, res.id),
      activity(db, "reservation.cancelled", "reservation", res.id, `${res.reference} cancelled: ${why}${paid ? ` (${naira(paid)} paid: fee ${naira(fee)}, refund ${naira(refund)})` : ""}`, {
        paid_kobo: paid, fee_kobo: fee, refund_kobo: refund,
      }),
    ];
    if (refund > 0) {
      stmts.push(
        db
          .prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?")
          .bind(`Cancelled by staff. Refund ${naira(refund)} (fee kept: ${naira(fee)}). For the general manager to approve.`, res.id),
      );
    }
    await writeBatch(db, actor, stmts, why);
  });
}

export async function markNoShow(db: Db, actor: Actor, reservationId: string): Promise<{ undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "confirmed") throw new AppError("INVALID_TRANSITION", "Only a paid booking whose guest hasn't arrived can be marked as a no-show.");
    if (res.check_in > hotelToday()) throw new AppError("VALIDATION", "The guest isn't due yet.");
    const paid = await netPaid(db, res.id);
    const note = paid > 0 ? `No-show. ${naira(paid)} paid. Keep or refund is for the general manager to decide.` : null;
    const results = await writeBatch(db, actor, [
      assertNetPaid(db, res.id, paid),
      assertVersion(db, "reservations", res.id, res.version),
      db
        .prepare("UPDATE reservations SET status = 'no_show', attention_reason = coalesce(?, attention_reason) WHERE id = ?")
        .bind(note, res.id),
      activity(db, "reservation.no_show", "reservation", res.id, `${res.reference} marked as no-show${paid ? `: ${naira(paid)} paid, waiting for a keep or refund decision` : ""}`, {
        paid_kobo: paid,
      }),
    ]);
    return { undoId: results.at(-1)?.meta.last_row_id ?? null };
  });
}

export async function updateReservationDetails(db: Db, actor: Actor, reservationId: string, guests: number, specialRequests: string | null): Promise<void> {
  requireRole(actor, ALL_STAFF);
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw new AppError("INVALID_TRANSITION", "This booking has ended (checked out, cancelled or a no-show), so its dates and room can't change. Make a new booking instead.");
    const cat = await first<{ max_occupancy: number }>(db, "SELECT max_occupancy FROM room_categories WHERE id = ?", res.category_id);
    const max = cat?.max_occupancy ?? 1;
    if (!Number.isInteger(guests) || guests < 1 || guests > max) throw new AppError("VALIDATION", `This room type sleeps up to ${max}.`);
    await writeBatch(db, actor, [
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET guest_count = ?, special_requests = ? WHERE id = ?").bind(guests, specialRequests?.trim() || null, res.id),
      activity(db, "reservation.updated", "reservation", res.id, `${res.reference} details updated`, { guest_count: guests }),
    ]);
  });
}

export const UNDO_WINDOW_MS = 30_000; // the UI offers 10 s; the server allows for slow networks
const UNDOABLE = ["reservation.room_assigned", "reservation.checked_in", "reservation.checked_out", "reservation.no_show"] as const;

export async function undoAction(db: Db, actor: Actor, reservationId: string, activityId: number): Promise<{ message: string }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const entry = await first<{ id: number; action: string; actor_id: string | null; entity_id: string; metadata: string; created_at: string }>(
      db,
      "SELECT id, action, actor_id, entity_id, metadata, created_at FROM activity_log WHERE id = ?",
      activityId,
    );
    const tooLate = new AppError("CONFLICT", "That can no longer be undone. Make the change again from the booking.");
    if (!entry || entry.entity_id !== reservationId || !(UNDOABLE as readonly string[]).includes(entry.action)) throw tooLate;
    if (entry.actor_id !== actor.id) throw new AppError("FORBIDDEN", "Only the person who made a change can undo it.");
    if (Date.now() - Date.parse(entry.created_at) > UNDO_WINDOW_MS) throw tooLate;
    const later = await first(db, "SELECT 1 FROM activity_log WHERE entity_id = ? AND id > ?", reservationId, activityId);
    if (later) throw tooLate;

    const res = await loadReservation(db, reservationId);
    const meta = JSON.parse(entry.metadata) as { previous_room_id?: string | null; previous_room_readiness?: string | null; room_id?: string | null; charge_kobo?: number };
    const stmts: Stmt[] = [assertVersion(db, "reservations", res.id, res.version)];
    let message: string;

    switch (entry.action) {
      case "reservation.room_assigned": {
        if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw tooLate;
        stmts.push(
          db
            .prepare("UPDATE reservations SET room_id = ?, room_change_kobo = max(0, room_change_kobo - ?) WHERE id = ?")
            .bind(meta.previous_room_id ?? null, meta.charge_kobo ?? 0, res.id),
        );
        if (res.status === "checked_in" && meta.previous_room_id && meta.previous_room_readiness) {
          stmts.push(db.prepare("UPDATE rooms SET readiness = ? WHERE id = ?").bind(meta.previous_room_readiness, meta.previous_room_id));
        }
        message = meta.previous_room_id ? "Room change undone." : "Room assignment undone.";
        break;
      }
      case "reservation.checked_in":
        if (res.status !== "checked_in") throw tooLate;
        stmts.push(db.prepare("UPDATE reservations SET status = 'confirmed', checked_in_at = NULL WHERE id = ?").bind(res.id));
        message = "Check-in undone.";
        break;
      case "reservation.checked_out":
        if (res.status !== "checked_out") throw tooLate;
        stmts.push(db.prepare("UPDATE reservations SET status = 'checked_in', checked_out_at = NULL WHERE id = ?").bind(res.id));
        if (meta.room_id && meta.previous_room_readiness) {
          stmts.push(db.prepare("UPDATE rooms SET readiness = ? WHERE id = ?").bind(meta.previous_room_readiness, meta.room_id));
        }
        message = "Check-out undone.";
        break;
      default: // reservation.no_show
        if (res.status !== "no_show") throw tooLate;
        stmts.push(
          db
            .prepare("UPDATE reservations SET status = 'confirmed', cancellation_fee_kobo = NULL, attention_reason = CASE WHEN attention_reason LIKE 'No-show.%' THEN NULL ELSE attention_reason END WHERE id = ?")
            .bind(res.id),
        );
        message = "No-show undone.";
    }
    stmts.push(activity(db, "reservation.undone", "reservation", res.id, `${res.reference}: ${message.replace(/\.$/, "").toLowerCase()}`, { undid: entry.action, activity_id: entry.id }));
    try {
      await writeBatch(db, actor, stmts, "Undone");
    } catch (err) {
      rethrow(err, {
        room_overlap: new AppError("CONFLICT", "The previous room has been given to another guest, so this can't be undone."),
        no_capacity: new AppError("UNAVAILABLE", "This room type has filled up since, so this can't be undone."),
      });
    }
    return { message };
  });
}

export async function overridePaymentRequirement(
  db: Db,
  actor: Actor,
  reservationId: string,
  action: "confirm" | "extend",
  reason: string,
  extendHours = 24,
): Promise<void> {
  requireRole(actor, MANAGERS);
  const why = (reason ?? "").trim();
  if (why.length < 5) throw new AppError("VALIDATION", "Give a reason (it's saved in Activity).");
  if (action === "confirm") throw new AppError("VALIDATION", "Bookings are confirmed only when paid in full. Take the payment, or hold the room longer.");
  if (action !== "extend") throw new AppError("VALIDATION", "That button didn't work as expected. Reload the page and try again.");
  if (action === "extend" && (!Number.isInteger(extendHours) || extendHours < 1 || extendHours > 336)) {
    throw new AppError("VALIDATION", "Hold the room longer by 1 hour to 14 days.");
  }
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "pending_payment") throw new AppError("INVALID_TRANSITION", "Only a booking awaiting payment can be held longer.");
    const lapsedMessage = new AppError("UNAVAILABLE", "The hold has lapsed and this room type is now fully booked for those dates.");
    if (!isHoldLive(res) && (await freeUnits(db, res.category_id, res.check_in, res.check_out, res.id)) <= 0) throw lapsedMessage;

    const t = now();
    const base = res.hold_expires_at && res.hold_expires_at > t ? res.hold_expires_at : t;
    const newHold = new Date(Date.parse(base) + extendHours * 3_600_000).toISOString();
    const change = db.prepare("UPDATE reservations SET hold_expires_at = ? WHERE id = ?").bind(newHold, res.id);
    try {
      await writeBatch(
        db,
        actor,
        [
          assertVersion(db, "reservations", res.id, res.version),
          change,
          activity(
            db,
            "reservation.payment_override",
            "reservation",
            res.id,
            `${res.reference} hold extended ${extendHours}h while waiting for payment: ${why}`,
            { action, reason: why },
          ),
        ],
        why,
      );
    } catch (err) {
      rethrow(err, { no_capacity: lapsedMessage });
    }
  });
}

export async function changeReservationDates(db: Db, actor: Actor, reservationId: string, checkIn: string, checkOut: string): Promise<{ chargeKobo: number; pendingChangeId?: string }> {
  requireRole(actor, ALL_STAFF);
  return changeDates(db, actor, reservationId, checkIn, checkOut);
}

/**
 * What new dates write: re-priced at the rate agreed at booking (extras, discount and any upgrade
 * re-applied), a refund flag if the guest has now paid more than the new total, and the activity line.
 */
export async function datesStatements(db: Db, res: ReservationRow, checkIn: string, checkOut: string, paidKobo: number, note = ""): Promise<{ stmts: Stmt[]; newDue: number }> {
  const category = res.room_id ? ((await loadRoom(db, res.room_id))?.category_id ?? res.category_id) : res.category_id;
  const nights = nightsBetween(checkIn, checkOut);
  const newTotal = res.nightly_rate_kobo * nights;
  const addedNights = Math.max(0, nights - nightsBetween(res.check_in, res.check_out));
  const upgrade = res.room_id && category !== res.category_id ? Math.max(0, (await categoryRate(db, category)) - res.nightly_rate_kobo) : 0;
  const extraUpgrade = upgrade * addedNights;
  const newDue = newTotal + (await newExtras(db, res.id, nights)) + res.room_change_kobo + extraUpgrade - Math.round((newTotal * res.discount_pct) / 100);
  const stmts = [
    db
      .prepare(
        `UPDATE reservations SET check_in = ?1, check_out = ?2, total_amount_kobo = ?3,
           discount_kobo = CAST(round(?3 * discount_pct / 100.0) AS INTEGER),
           extras_kobo = (SELECT coalesce(sum(unit_price_kobo * CASE per_night WHEN 1 THEN ?4 ELSE 1 END), 0) FROM reservation_extras WHERE reservation_id = ?5),
           room_change_kobo = room_change_kobo + ?6
         WHERE id = ?5`,
      )
      .bind(checkIn, checkOut, newTotal, nights, res.id, extraUpgrade),
  ];
  if (paidKobo > newDue) {
    stmts.push(
      db.prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?").bind("Dates shortened: the guest has paid more than the new total. Arrange a refund for the difference.", res.id),
    );
  }
  stmts.push(
    activity(db, "reservation.dates_changed", "reservation", res.id, `${res.reference} dates changed: ${checkIn} → ${checkOut} (was ${res.check_in} → ${res.check_out})${note}`, {
      from_total_kobo: res.total_amount_kobo,
      to_total_kobo: newTotal,
    }),
  );
  return { stmts, newDue };
}

export const datesConflicts = (checkIn: string, checkOut: string) => ({
  room_overlap: new AppError("CONFLICT", "The assigned room is booked on some of the new nights. Change the room first, or choose other dates."),
  no_capacity: new AppError("UNAVAILABLE", `No availability for ${formatDate(checkIn, { year: false })} to ${formatDate(checkOut, { year: false })} in this room type.`),
});

export async function changeDates(db: Db, actor: Actor, reservationId: string, checkIn: string, checkOut: string, byGuest = false): Promise<{ chargeKobo: number; pendingChangeId?: string }> {
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw new AppError("INVALID_TRANSITION", "This booking has ended (checked out, cancelled or a no-show), so its dates and room can't change. Make a new booking instead.");
    if (res.status === "checked_in" && checkIn !== res.check_in) throw new AppError("VALIDATION", "The guest is in house: only the check-out date can change.");
    validateStay(checkIn, checkOut, res.guest_count, res.status === "checked_in");
    if (checkIn === res.check_in && checkOut === res.check_out) return { chargeKobo: 0 };

    const category = res.room_id ? ((await loadRoom(db, res.room_id))?.category_id ?? res.category_id) : res.category_id;
    const conflicts = datesConflicts(checkIn, checkOut);
    if ((await freeUnits(db, category, checkIn, checkOut, res.id)) <= 0) throw conflicts.no_capacity;
    if (res.room_id) {
      const busy = await first(
        db,
        `SELECT 1 FROM reservations o WHERE o.room_id = ? AND o.id <> ? AND o.status IN ('pending_payment', 'confirmed', 'checked_in')
           AND o.check_in < ? AND ? < ${stayEndSql("o")}`,
        res.room_id, res.id, checkOut, checkIn,
      );
      if (busy) throw conflicts.room_overlap;
    }

    const paid = await netPaid(db, res.id);
    const plan = await datesStatements(db, res, checkIn, checkOut, paid);
    const increase = plan.newDue - dueOf(res);
    if (byGuest && res.status === "confirmed" && plan.newDue > paid) {
      throw new AppError("VALIDATION", `These dates cost ${formatNaira(plan.newDue - paid)} more. Bookings are paid in full, so please contact the hotel to change to these dates.`);
    }
    if (increase > 0 && (res.status === "confirmed" || res.status === "checked_in")) {
      // Money first: extra nights on a paid booking wait for their payment (rules 2.1).
      const added = nightsBetween(checkIn, checkOut) - nightsBetween(res.check_in, res.check_out);
      const more = added > 0 ? ` (${added} more night${added === 1 ? "" : "s"})` : "";
      const description =
        res.status === "checked_in"
          ? `Stay extended to ${formatDate(checkOut, { year: false })}${more}`
          : `New dates: ${formatDate(checkIn, { year: false })} to ${formatDate(checkOut, { year: false })}${more}`;
      const pendingChangeId = await requestChange(db, actor, res, { kind: "dates", checkIn, checkOut, amountKobo: increase, description });
      return { chargeKobo: increase, pendingChangeId };
    }
    try {
      await writeBatch(db, actor, [assertVersion(db, "reservations", res.id, res.version), ...plan.stmts]);
    } catch (err) {
      rethrow(err, conflicts);
    }
    return { chargeKobo: 0 };
  });
}

export async function resolveAttention(db: Db, actor: Actor, reservationId: string, note: string): Promise<void> {
  requireRole(actor, MONEY_APPROVERS);
  const how = (note ?? "").trim();
  if (how.length < 5) throw new AppError("VALIDATION", "Describe how this was resolved.");
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (!res.attention_reason) return;
    await writeBatch(db, actor, [
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET attention_reason = NULL WHERE id = ?").bind(res.id),
      activity(db, "reservation.attention_resolved", "reservation", res.id, `${res.reference}: issue resolved: ${how}`, { was: res.attention_reason }),
    ]);
  });
}

export async function expireUnpaidReservations(db: Db): Promise<number> {
  const t = now();
  const [, expired] = await writeBatch(
    db,
    null,
    [
      db
        .prepare(
          `INSERT INTO activity_log (actor_type, action, entity_type, entity_id, summary)
           SELECT 'system', 'reservation.expired', 'reservation', id, reference || ' expired: payment not received in time'
           FROM reservations WHERE status = 'pending_payment' AND hold_expires_at <= ?`,
        )
        .bind(t),
      db.prepare("UPDATE reservations SET status = 'expired' WHERE status = 'pending_payment' AND hold_expires_at <= ?").bind(t),
    ],
    "Payment hold lapsed",
  );
  return expired?.meta.changes ?? 0;
}

const label = (s: string) => s.replace(/_/g, " ");

export async function updateRoomStatus(
  db: Db,
  actor: Actor,
  input: { roomId: string; readiness?: "needs_cleaning" | "cleaning_in_progress" | "ready"; serviceStatus?: "in_service" | "maintenance"; note?: string | null },
): Promise<void> {
  requireRole(actor, ALL_STAFF);
  await retryOnStale(async () => {
    const room = await first<RoomRow & { maintenance_note: string | null }>(
      db,
      "SELECT id, room_number, category_id, service_status, readiness, is_active, version, maintenance_note FROM rooms WHERE id = ?",
      input.roomId,
    );
    if (!room || !room.is_active) throw new AppError("NOT_FOUND", "Room not found.");
    const occupied = await first(db, "SELECT 1 FROM reservations WHERE room_id = ? AND status = 'checked_in'", room.id);
    if (input.serviceStatus === "maintenance" && occupied) {
      throw new AppError("CONFLICT", `Room ${room.room_number} has a guest checked in. Move the guest first.`);
    }
    const UPCOMING = `room_id = ?1 AND check_out > ?2 AND (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`;
    if (input.serviceStatus === "maintenance" && room.service_status !== "maintenance") {
      const booked = await first<{ reference: string; check_in: string }>(db, `SELECT reference, check_in FROM reservations WHERE ${UPCOMING} ORDER BY check_in LIMIT 1`, room.id, hotelToday());
      if (booked) throw new AppError("CONFLICT", `Room ${room.room_number} is booked from ${formatDate(booked.check_in, { year: false })} (${booked.reference}). Move that booking to another room first.`);
    }
    const readiness = input.readiness ?? room.readiness;
    const service = input.serviceStatus ?? room.service_status;
    const note = service === "maintenance" ? input.note?.trim() || room.maintenance_note : null;
    const changes = [
      input.readiness && input.readiness !== room.readiness ? `readiness ${label(input.readiness)}` : null,
      input.serviceStatus === "maintenance" && room.service_status !== "maintenance" ? `under maintenance${input.note?.trim() ? `: ${input.note.trim()}` : ""}` : null,
      input.serviceStatus === "in_service" && room.service_status !== "in_service" ? "returned to service" : null,
      service === "maintenance" && room.service_status === "maintenance" && note !== room.maintenance_note ? `maintenance note: ${note}` : null,
    ].filter(Boolean);
    if (!changes.length) return;
    const stmts = [
      assertVersion(db, "rooms", room.id, room.version),
      db.prepare("UPDATE rooms SET readiness = ?, service_status = ?, maintenance_note = ? WHERE id = ?").bind(readiness, service, note, room.id),
      activity(db, "room.status_updated", "room", room.id, `Room ${room.room_number}: ${changes.join(", ")}`, {
        readiness: input.readiness !== room.readiness ? (input.readiness ?? null) : null,
        service_status: input.serviceStatus !== room.service_status ? (input.serviceStatus ?? null) : null,
      }),
    ];
    if (input.serviceStatus === "maintenance") {
      stmts.splice(
        1,
        0,
        db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE EXISTS (SELECT 1 FROM reservations WHERE room_id = ? AND status = 'checked_in')").bind(room.id),
        db.prepare(`INSERT INTO _guard (ok) SELECT 0 WHERE EXISTS (SELECT 1 FROM reservations WHERE ${UPCOMING})`).bind(room.id, hotelToday()),
      );
    }
    await writeBatch(db, actor, stmts);
  });
}

export async function updateGuest(
  db: Db,
  actor: Actor,
  input: { guestId: string; fullName: string; phone: string | null; email: string | null; notes: string | null },
): Promise<void> {
  requireRole(actor, ALL_STAFF);
  try {
    const [result] = await writeBatch(db, actor, [
      db
        .prepare("UPDATE guests SET full_name = ?, phone = ?, email = ?, notes = ? WHERE id = ?")
        .bind(input.fullName.trim(), input.phone?.trim() || null, input.email?.trim().toLowerCase() || null, input.notes?.trim() || null, input.guestId),
    ]);
    if (!result?.meta.changes) throw new AppError("NOT_FOUND", "Guest not found.");
  } catch (err) {
    rethrow(err, { unique: new AppError("CONFLICT", "Another guest already uses this email.") });
  }
}

export async function validPromo(db: Db, code: string): Promise<{ code: string; percent_off: number }> {
  const p = await first<{ code: string; percent_off: number; is_active: number; valid_until: string | null; max_uses: number | null; used_count: number }>(
    db,
    "SELECT code, percent_off, is_active, valid_until, max_uses, used_count FROM promo_codes WHERE code = ?",
    code.trim().toUpperCase(),
  );
  const bad = new AppError("VALIDATION", "That promo code isn't valid.");
  if (!p || !p.is_active) throw bad;
  if (p.valid_until && p.valid_until < hotelToday()) throw new AppError("VALIDATION", "That promo code has expired.");
  if (p.max_uses !== null && p.used_count >= p.max_uses) throw new AppError("VALIDATION", "That promo code has been fully used.");
  return { code: p.code, percent_off: p.percent_off };
}

async function newExtras(db: Db, reservationId: string, nights: number): Promise<number> {
  const r = await first<{ kobo: number }>(
    db,
    "SELECT coalesce(sum(unit_price_kobo * CASE per_night WHEN 1 THEN ? ELSE 1 END), 0) AS kobo FROM reservation_extras WHERE reservation_id = ?",
    nights,
    reservationId,
  );
  return r?.kobo ?? 0;
}
