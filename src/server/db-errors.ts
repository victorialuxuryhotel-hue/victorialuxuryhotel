import { AppError, type ErrorCode } from "@/lib/errors";

const tokens: Record<string, [ErrorCode, string]> = {
  room_overlap: ["CONFLICT", "That room is already booked for some of these nights."],
  no_capacity: ["UNAVAILABLE", "Sorry, this room type is no longer available for those dates."],
  too_many_holds: ["CONFLICT", "You already have bookings waiting for payment. Please complete or wait for those first, or contact the hotel."],
  invalid_transition: ["INVALID_TRANSITION", "That change isn't allowed for this reservation's current status."],
  invalid_initial_status: ["INVALID_TRANSITION", "A new reservation must start as awaiting payment or confirmed."],
  reservation_closed: ["INVALID_TRANSITION", "This reservation is closed and its stay details can't change."],
  in_house_frozen: ["VALIDATION", "The guest is in house: only the check-out date can change."],
  payment_immutable: ["CONFLICT", "Successful payments can't be changed. Record a correction instead."],
  payment_closed: ["CONFLICT", "A closed payment attempt can't be reopened."],
  rate_below_minimum: ["VALIDATION", "The minimum rate is ₦40,000 a night."],
  invalid_correction: ["VALIDATION", "A correction can't be more than what was paid with that payment."],
  activity_log_immutable: ["FORBIDDEN", "Activity records can't be changed or deleted."],
  last_owner: ["CONFLICT", "At least one active owner is required."],
  staff_delete_forbidden: ["FORBIDDEN", "Staff accounts are deactivated, not deleted."],
  delete_forbidden: ["CONFLICT", "This can't be deleted because bookings refer to it. Deactivate it instead."],
  department_needs_front_desk: ["VALIDATION", "Finance and Restaurant & bar are separate roles."],
  discount_too_large: ["VALIDATION", "The discount can't be more than the room price."],
  promo_invalid: ["VALIDATION", "That promo code can no longer be used."],
  expense_immutable: ["CONFLICT", "Expenses can't be changed or deleted. Void it with a reason instead."],
  sale_immutable: ["CONFLICT", "Sales can't be changed or deleted. A manager can void one with a reason."],
  room_charge_not_in_house: ["VALIDATION", "Only guests staying now can charge to their room."],
  unsettled_charges: ["VALIDATION", "Restaurant & bar charges are unpaid. Settle them before check-out."],
  stock_move_immutable: ["CONFLICT", "Stock records can't be changed or deleted. Record an adjustment instead."],
  hall_overlap: ["CONFLICT", "The hall is already booked at that time."],
  history_immutable: ["FORBIDDEN", "Booking history can't be deleted."],
  order_immutable: ["CONFLICT", "Paid and closed orders can't be changed. A manager can void a sale with a reason."],
  order_transition: ["INVALID_TRANSITION", "That change isn't allowed for this order."],
  closing_immutable: ["CONFLICT", "A signed-off closing can't be changed."],
  lead_needs_restaurant_bar: ["VALIDATION", "Only restaurant & bar staff can be the restaurant & bar manager."],
  hall_booking_delete_forbidden: ["FORBIDDEN", "Hall bookings are cancelled, not deleted."],
};

export function dbErrorToken(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  const token = /\b([a-z_]+): SQLITE_CONSTRAINT/.exec(message)?.[1];
  if (token && token in tokens) return token;
  if (/UNIQUE constraint failed/.test(message)) return "unique";
  if (/FOREIGN KEY constraint failed/.test(message)) return "foreign_key";
  if (/CHECK constraint failed/.test(message)) return "check";
  return null;
}

export class StaleStateError extends Error {
  constructor(cause?: unknown) {
    super("stale_state", { cause });
    this.name = "StaleStateError";
  }
}

export function translateDbError(err: unknown): Error {
  if (err instanceof AppError || err instanceof StaleStateError) return err;
  if (/\bstale_state: SQLITE_CONSTRAINT/.test(err instanceof Error ? err.message : String(err))) return new StaleStateError(err);
  const token = dbErrorToken(err);
  const known = token ? tokens[token] : undefined;
  if (known) return new AppError(known[0], known[1], { cause: err });
  if (token === "unique") return new AppError("CONFLICT", "That already exists.", { cause: err });
  if (token === "check" || token === "foreign_key") return new AppError("VALIDATION", "Some details aren't valid. Check and try again.", { cause: err });
  return new AppError("INTERNAL", "Something went wrong. Please try again.", { cause: err });
}

export function cleanSearch(q: string | undefined | null): string {
  return (q ?? "").replace(/[%_\\]/g, "").trim().slice(0, 60);
}
