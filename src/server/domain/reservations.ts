import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { hotelToday, nightsBetween } from "@/lib/hotel-date";
import { dbErrorToken } from "../db-errors";
import {
  activity,
  ALL_STAFF,
  all,
  assertVersion,
  first,
  MANAGERS,
  now,
  requireRole,
  retryOnStale,
  uuid,
  writeBatch,
  type Actor,
  type Db,
  type Stmt,
} from "../db";
import { freeUnits, validateStay } from "./inventory";

/**
 * The reservation engine. Every state change goes through a function here.
 * Each one checks the actor's role, reads what it needs, validates the
 * business rules with clear messages, and writes the change plus its audit
 * record in one atomic batch guarded against concurrent changes. Database
 * triggers re-enforce the hard rules (overlap, capacity, transitions).
 */

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
};

const SELECT_RES = `SELECT id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, attention_reason, version FROM reservations`;

export async function loadReservation(db: Db, id: string): Promise<ReservationRow> {
  const res = await first<ReservationRow>(db, `${SELECT_RES} WHERE id = ?`, id);
  if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
  return res;
}

/** Net verified money in (payments minus refunds). */
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

/** Human-friendly, non-sequential reference (no 0/O/1/I/L confusion). */
export function generateReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "VL-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Errors from the batch that need a message more specific than the generic one. */
function rethrow(err: unknown, messages: Partial<Record<string, AppError>>): never {
  const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
  const specific = token ? messages[token] : undefined;
  throw specific ?? err;
}

// ---------------------------------------------------------------------------
// Creation (website and staff share one engine)
// ---------------------------------------------------------------------------

type CreateInput = {
  categoryId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestId?: string | null;
  /** Staff only: the specific room, checked against the type and the dates. */
  roomId?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  specialRequests?: string | null;
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

  if (input.roomId) {
    const room = await loadRoom(db, input.roomId);
    if (!room || !room.is_active || room.category_id !== cat.id) throw new AppError("VALIDATION", `Choose a ${cat.name} room.`);
    if (room.service_status !== "in_service") throw new AppError("UNAVAILABLE", `Room ${room.room_number} is under maintenance.`);
  }

  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const fullName = input.fullName?.trim() ?? "";
  if (input.guestId) {
    if (!(await first(db, "SELECT 1 FROM guests WHERE id = ?", input.guestId))) throw new AppError("NOT_FOUND", "Guest not found.");
  } else if (fullName.length < 2) {
    throw new AppError("VALIDATION", "Enter the guest's full name.");
  }

  const nights = nightsBetween(input.checkIn, input.checkOut);
  const total = cat.nightly_rate_kobo * nights;
  const holdExpiresAt = new Date(Date.now() + input.holdMinutes * 60_000).toISOString();

  // A reference collision is astronomically rare; retry with a new one if it happens.
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
      // Link returning guests by email. Never overwrite an existing name from
      // an unauthenticated booking; only fill in a missing phone number.
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
             nightly_rate_kobo, total_amount_kobo, status, source, special_requests, hold_expires_at, created_by)
           VALUES (?, ?, ?, ${guestExpr}, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?)`,
        )
        .bind(
          id, reference, publicToken, guestParam, cat.id, input.roomId || null, input.checkIn, input.checkOut, input.guests,
          cat.nightly_rate_kobo, total, input.source, input.specialRequests?.trim() || null, holdExpiresAt, input.createdBy,
        ),
      activity(db, "reservation.created", "reservation", id, `Reservation ${reference} created: ${cat.name}, ${input.checkIn} → ${input.checkOut}`, {
        source: input.source,
        total_kobo: total,
      }),
    );
    try {
      await writeBatch(db, actor, stmts);
      return { id, reference, publicToken, totalAmountKobo: total, holdExpiresAt };
    } catch (err) {
      const collided = err instanceof AppError && dbErrorToken(err.cause) === "unique" && /reservations\.(reference|public_token)/.test(String((err.cause as Error)?.message));
      if (collided && attempt < 3) continue;
      rethrow(err, { no_capacity: unavailable, room_overlap: new AppError("CONFLICT", "That room was just booked for some of these nights. Choose another.") });
    }
  }
}

/** Website: called by the server after validating input. Holds for the website hold period. */
export async function createWebsiteReservation(
  db: Db,
  input: { categorySlug: string; checkIn: string; checkOut: string; guests: number; fullName: string; email: string; phone: string; specialRequests?: string | null },
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

/** Staff: walk-in, phone, WhatsApp. Same engine; held for the direct-booking period. */
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

// ---------------------------------------------------------------------------
// Room assignment
// ---------------------------------------------------------------------------

type RoomRow = { id: string; room_number: string; category_id: string; service_status: string; readiness: string; is_active: number; version: number };
const loadRoom = (db: Db, id: string) =>
  first<RoomRow>(db, "SELECT id, room_number, category_id, service_status, readiness, is_active, version FROM rooms WHERE id = ?", id);

export async function assignRoom(db: Db, actor: Actor, reservationId: string, roomId: string): Promise<{ undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) {
      throw new AppError("INVALID_TRANSITION", "Rooms can only be assigned to upcoming or in-house reservations.");
    }
    const room = await loadRoom(db, roomId);
    if (!room || !room.is_active) throw new AppError("NOT_FOUND", "Room not found.");
    if (room.service_status !== "in_service") throw new AppError("UNAVAILABLE", `Room ${room.room_number} is under maintenance.`);
    if (res.room_id === roomId) return { undoId: null };

    // The reservation counts against its assigned room's category, or the
    // booked one. Moving it to a room in another category (an upgrade, or
    // back) uses that category's inventory: check it.
    const oldRoom = res.room_id ? await loadRoom(db, res.room_id) : null;
    const currentCategory = oldRoom?.category_id ?? res.category_id;
    if (room.category_id !== currentCategory) {
      const from = res.check_in > hotelToday() ? res.check_in : hotelToday();
      if ((await freeUnits(db, room.category_id, from, res.check_out, res.id)) <= 0) {
        const cat = await first<{ name: string }>(db, "SELECT name FROM room_categories WHERE id = ?", room.category_id);
        throw new AppError("UNAVAILABLE", `No ${cat?.name ?? "room"} capacity left for these dates.`);
      }
    }

    const stmts = [
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET room_id = ? WHERE id = ?").bind(roomId, res.id),
    ];
    // A guest moved mid-stay leaves the old room to be cleaned.
    if (res.status === "checked_in" && res.room_id) {
      stmts.push(db.prepare("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?").bind(res.room_id));
    }
    stmts.push(
      activity(db, "reservation.room_assigned", "reservation", res.id, `Room ${room.room_number} assigned to ${res.reference}`, {
        room_id: roomId,
        previous_room_id: res.room_id,
        previous_room_readiness: oldRoom?.readiness ?? null,
      }),
    );
    try {
      const results = await writeBatch(db, actor, stmts);
      return { undoId: results.at(-1)?.meta.last_row_id ?? null };
    } catch (err) {
      rethrow(err, {
        room_overlap: new AppError("CONFLICT", `Room ${room.room_number} is already booked for some of these nights.`),
        no_capacity: new AppError("UNAVAILABLE", "No capacity left in that room type for these dates."),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Front desk lifecycle
// ---------------------------------------------------------------------------

export async function checkInReservation(db: Db, actor: Actor, reservationId: string): Promise<{ undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "confirmed") {
      throw new AppError(
        "INVALID_TRANSITION",
        res.status === "pending_payment"
          ? "This reservation is awaiting payment. Record payment or ask a manager to confirm it."
          : res.status === "checked_in"
            ? "This guest is already checked in."
            : "Only confirmed reservations can be checked in.",
      );
    }
    const today = hotelToday();
    if (res.check_in > today) throw new AppError("VALIDATION", `Arrival is not until ${res.check_in}.`);
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

/** Returns the balance still owed (the UI shows it) and the undo id. */
export async function checkOutReservation(db: Db, actor: Actor, reservationId: string): Promise<{ balance: number; undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "checked_in") throw new AppError("INVALID_TRANSITION", "Only checked-in guests can be checked out.");
    const balance = res.total_amount_kobo - (await netPaid(db, res.id));
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
    if (res.status !== "pending_payment" && res.status !== "confirmed") throw new AppError("INVALID_TRANSITION", "Only upcoming reservations can be cancelled.");
    await writeBatch(
      db,
      actor,
      [
        assertVersion(db, "reservations", res.id, res.version),
        db.prepare("UPDATE reservations SET status = 'cancelled', cancellation_reason = ? WHERE id = ?").bind(why, res.id),
        activity(db, "reservation.cancelled", "reservation", res.id, `${res.reference} cancelled: ${why}`),
      ],
      why,
    );
  });
}

export async function markNoShow(db: Db, actor: Actor, reservationId: string): Promise<{ undoId: number | null }> {
  requireRole(actor, ALL_STAFF);
  return retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "confirmed") throw new AppError("INVALID_TRANSITION", "Only confirmed reservations can be marked as no-show.");
    if (res.check_in > hotelToday()) throw new AppError("VALIDATION", "The guest isn't due yet.");
    const results = await writeBatch(db, actor, [
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET status = 'no_show' WHERE id = ?").bind(res.id),
      activity(db, "reservation.no_show", "reservation", res.id, `${res.reference} marked as no-show`),
    ]);
    return { undoId: results.at(-1)?.meta.last_row_id ?? null };
  });
}

/** Editable details that don't affect price or inventory. */
export async function updateReservationDetails(db: Db, actor: Actor, reservationId: string, guests: number, specialRequests: string | null): Promise<void> {
  requireRole(actor, ALL_STAFF);
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw new AppError("INVALID_TRANSITION", "This reservation is closed.");
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

// ---------------------------------------------------------------------------
// Undo: room assignment and status changes, within a short window.
// Never payments (a manager records a correction) and never cancellations
// (the guest has already been emailed).
// ---------------------------------------------------------------------------

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
    const tooLate = new AppError("CONFLICT", "That can no longer be undone. Make the change again from the reservation.");
    if (!entry || entry.entity_id !== reservationId || !(UNDOABLE as readonly string[]).includes(entry.action)) throw tooLate;
    if (entry.actor_id !== actor.id) throw new AppError("FORBIDDEN", "Only the person who made a change can undo it.");
    if (Date.now() - Date.parse(entry.created_at) > UNDO_WINDOW_MS) throw tooLate;
    // Nothing else may have happened to this booking since.
    const later = await first(db, "SELECT 1 FROM activity_log WHERE entity_id = ? AND id > ?", reservationId, activityId);
    if (later) throw tooLate;

    const res = await loadReservation(db, reservationId);
    const meta = JSON.parse(entry.metadata) as { previous_room_id?: string | null; previous_room_readiness?: string | null; room_id?: string | null };
    const stmts: Stmt[] = [assertVersion(db, "reservations", res.id, res.version)];
    let message: string;

    switch (entry.action) {
      case "reservation.room_assigned": {
        if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw tooLate;
        stmts.push(db.prepare("UPDATE reservations SET room_id = ? WHERE id = ?").bind(meta.previous_room_id ?? null, res.id));
        // A mid-stay move had marked the old room for cleaning: put it back as it was.
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
        stmts.push(db.prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ?").bind(res.id));
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

// ---------------------------------------------------------------------------
// Manager override of the payment requirement (reason required, audited)
// ---------------------------------------------------------------------------

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
  if (why.length < 5) throw new AppError("VALIDATION", "Give a reason (it is recorded in the activity log).");
  if (action !== "confirm" && action !== "extend") throw new AppError("VALIDATION", "Unknown action.");
  if (action === "extend" && (!Number.isInteger(extendHours) || extendHours < 1 || extendHours > 336)) {
    throw new AppError("VALIDATION", "Extend by 1 hour to 14 days.");
  }
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (res.status !== "pending_payment") throw new AppError("INVALID_TRANSITION", "Only reservations awaiting payment can be overridden.");
    const lapsedMessage = new AppError("UNAVAILABLE", "The hold has lapsed and this room type is now fully booked for those dates.");
    // If the hold already lapsed the inventory was released: re-check it.
    if (!isHoldLive(res) && (await freeUnits(db, res.category_id, res.check_in, res.check_out, res.id)) <= 0) throw lapsedMessage;

    const t = now();
    const base = res.hold_expires_at && res.hold_expires_at > t ? res.hold_expires_at : t;
    const newHold = new Date(Date.parse(base) + extendHours * 3_600_000).toISOString();
    const change =
      action === "confirm"
        ? db.prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ?").bind(res.id)
        : db.prepare("UPDATE reservations SET hold_expires_at = ? WHERE id = ?").bind(newHold, res.id);
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
            `${res.reference} ${action === "confirm" ? "confirmed" : `hold extended ${extendHours}h`} without payment: ${why}`,
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

// ---------------------------------------------------------------------------
// Date changes (same room type). Price uses the rate agreed at booking.
// ---------------------------------------------------------------------------

export async function changeReservationDates(db: Db, actor: Actor, reservationId: string, checkIn: string, checkOut: string): Promise<void> {
  requireRole(actor, ALL_STAFF);
  await retryOnStale(async () => {
    const res = await loadReservation(db, reservationId);
    if (!["pending_payment", "confirmed", "checked_in"].includes(res.status)) throw new AppError("INVALID_TRANSITION", "This reservation is closed.");
    if (res.status === "checked_in" && checkIn !== res.check_in) throw new AppError("VALIDATION", "The guest is in house: only the check-out date can change.");
    validateStay(checkIn, checkOut, res.guest_count, res.status === "checked_in");
    if (checkIn === res.check_in && checkOut === res.check_out) return;

    const category = res.room_id ? ((await loadRoom(db, res.room_id))?.category_id ?? res.category_id) : res.category_id;
    const noRoom = new AppError("UNAVAILABLE", "No availability for the new dates in this room type.");
    if ((await freeUnits(db, category, checkIn, checkOut, res.id)) <= 0) throw noRoom;

    const newTotal = res.nightly_rate_kobo * nightsBetween(checkIn, checkOut);
    const paid = await netPaid(db, res.id);
    const stmts = [
      assertVersion(db, "reservations", res.id, res.version),
      db.prepare("UPDATE reservations SET check_in = ?, check_out = ?, total_amount_kobo = ? WHERE id = ?").bind(checkIn, checkOut, newTotal, res.id),
    ];
    if (paid > newTotal) {
      stmts.push(
        db
          .prepare("UPDATE reservations SET attention_reason = ? WHERE id = ?")
          .bind("Dates shortened: the guest has paid more than the new total. Arrange a refund for the difference.", res.id),
      );
    }
    stmts.push(
      activity(db, "reservation.dates_changed", "reservation", res.id, `${res.reference} dates changed: ${checkIn} → ${checkOut} (was ${res.check_in} → ${res.check_out})`, {
        from_total_kobo: res.total_amount_kobo,
        to_total_kobo: newTotal,
      }),
    );
    try {
      await writeBatch(db, actor, stmts);
    } catch (err) {
      rethrow(err, {
        room_overlap: new AppError("CONFLICT", "The assigned room is booked on some of the new nights. Unassign or change the room first."),
        no_capacity: noRoom,
      });
    }
  });
}

/** Managers clear a "needs attention" flag once handled, with a note. */
export async function resolveAttention(db: Db, actor: Actor, reservationId: string, note: string): Promise<void> {
  requireRole(actor, MANAGERS);
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

// ---------------------------------------------------------------------------
// Scheduled clean-up: mark lapsed holds as expired (system).
// ---------------------------------------------------------------------------

export async function expireUnpaidReservations(db: Db): Promise<number> {
  const t = now();
  // Same cut-off for both statements, so every expiry is logged exactly once.
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

// ---------------------------------------------------------------------------
// Room status (front desk) and guests
// ---------------------------------------------------------------------------

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
    const readiness = input.readiness ?? room.readiness;
    const service = input.serviceStatus ?? room.service_status;
    const note = service === "maintenance" ? input.note?.trim() || room.maintenance_note : null;
    const changes = [
      input.readiness && input.readiness !== room.readiness ? `readiness ${label(input.readiness)}` : null,
      input.serviceStatus === "maintenance" && room.service_status !== "maintenance" ? `under maintenance${input.note?.trim() ? `: ${input.note.trim()}` : ""}` : null,
      input.serviceStatus === "in_service" && room.service_status !== "in_service" ? "returned to service" : null,
    ].filter(Boolean);
    const stmts = [
      assertVersion(db, "rooms", room.id, room.version),
      db.prepare("UPDATE rooms SET readiness = ?, service_status = ?, maintenance_note = ? WHERE id = ?").bind(readiness, service, note, room.id),
      activity(db, "room.status_updated", "room", room.id, `Room ${room.room_number}: ${changes.join(", ")}`, {
        readiness: input.readiness ?? null,
        service_status: input.serviceStatus ?? null,
      }),
    ];
    // Backstop for a guest checked in between the read and the write.
    if (input.serviceStatus === "maintenance") {
      stmts.splice(1, 0, db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE EXISTS (SELECT 1 FROM reservations WHERE room_id = ? AND status = 'checked_in')").bind(room.id));
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

/** Rooms that can take this reservation (same or other categories), for the assign-room picker. */
export async function listAssignableRooms(db: Db, reservationId: string) {
  const res = await loadReservation(db, reservationId);
  return all<{ id: string; room_number: string; category_id: string; readiness: string }>(
    db,
    `SELECT rm.id, rm.room_number, rm.category_id, rm.readiness FROM rooms rm
     WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
       AND NOT EXISTS (
         SELECT 1 FROM reservations r WHERE r.room_id = rm.id AND r.id <> ?1
           AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
           AND r.check_in < ?3 AND ?2 < r.check_out)
     ORDER BY rm.room_number`,
    res.id,
    res.check_in,
    res.check_out,
  );
}
