import { AppError, type ErrorCode } from "@/lib/errors";

const tokens: Record<string, [ErrorCode, string]> = {
  room_overlap: ["CONFLICT", "That room is already booked for some of these nights."],
  no_capacity: ["UNAVAILABLE", "Sorry, this room type is no longer available for those dates."],
  preferred_room_type: ["VALIDATION", "That room isn't one of the chosen room type. Choose the type again from the calendar."],
  too_many_holds: ["CONFLICT", "You already have bookings waiting for payment. Please complete or wait for those first, or contact the hotel."],
  invalid_transition: ["INVALID_TRANSITION", "This booking has changed since you opened it, for example it was checked in or cancelled. Reload to see where it is now."],
  invalid_initial_status: ["INVALID_TRANSITION", "This booking couldn't be created. Reload the page and try again."],
  reservation_closed: ["INVALID_TRANSITION", "This booking has ended (checked out, cancelled or a no-show), so its dates and room can't change. Make a new booking instead."],
  in_house_frozen: ["VALIDATION", "The guest is in house: only the check-out date can change."],
  payment_immutable: ["CONFLICT", "Payments can't be edited once saved. A manager can record a correction instead."],
  payment_closed: ["CONFLICT", "That online payment attempt has ended. Start a new payment."],
  invalid_correction: ["VALIDATION", "A correction can't be more than what was paid with that payment."],
  activity_log_immutable: ["FORBIDDEN", "Activity records can't be changed or deleted."],
  last_owner: ["CONFLICT", "At least one active owner is required."],
  staff_delete_forbidden: ["FORBIDDEN", "Staff accounts are deactivated, not deleted."],
  delete_forbidden: ["CONFLICT", "This can't be deleted because bookings refer to it. Deactivate it instead."],
  department_needs_front_desk: ["VALIDATION", "Finance and Restaurant & bar are separate roles."],
  discount_too_large: ["VALIDATION", "The discount can't be more than the room price."],
  promo_invalid: ["VALIDATION", "That promo code can no longer be used."],
  stock_move_immutable: ["CONFLICT", "Stock records can't be edited once saved. Record a count fix instead."],
  hall_overlap: ["CONFLICT", "The hall is already booked at that time."],
  history_immutable: ["FORBIDDEN", "Activity records can't be deleted."],
  order_immutable: ["CONFLICT", "Paid and closed orders can't be changed. A manager can void a sale with a reason."],
  order_transition: ["INVALID_TRANSITION", "This order has changed since you opened it, for example it was paid or cancelled. Reload to see where it is now."],
  closing_immutable: ["CONFLICT", "A signed-off closing can't be changed."],
  lead_needs_restaurant_bar: ["VALIDATION", "Only restaurant & bar staff can be the restaurant & bar manager."],
  hall_booking_delete_forbidden: ["FORBIDDEN", "Hall bookings are cancelled, not deleted."],
  not_paid: ["VALIDATION", "This booking isn't fully paid. Take the payment first, then check the guest in or out."],
  payment_incomplete: ["VALIDATION", "A payment needs how it was paid and who took it. For a bank transfer, enter the transfer reference or the sender's name."],
  hall_not_paid: ["VALIDATION", "A hall booking is confirmed once it has a price and is paid in full. Record the payment first."],
  payment_needs_reference: ["VALIDATION", "This payment needs its reference: the last 4 digits of the POS slip, or for a transfer the reference or sender's name."],
  sales_retired: ["FORBIDDEN", "Charging to a room isn't available. Customers pay at the counter."],
  vat_needs_tax_id: ["VALIDATION", "VAT can't be shown on receipts without the hotel's Tax ID (TIN). Enter the TIN first."],
  payment_check_immutable: ["CONFLICT", "A payment check can't be changed or deleted. If it was wrong, tell the owner."],
  payment_check_forbidden: ["FORBIDDEN", "Only the General Manager or the Owner can confirm payments."],
  room_before_payment: ["VALIDATION", "This booking isn't paid yet. Take the payment first: a room is given automatically once it's paid."],
  change_immutable: ["CONFLICT", "That change has already been paid for or cancelled. Reload to see where it is now."],
  payment_check_own_payment: ["FORBIDDEN", "You recorded this payment, so someone else confirms it: the General Manager or the Owner."],
  payment_issue_closed: ["CONFLICT", "This has already been checked and closed."],
  void_needs_manager: ["FORBIDDEN", "A void needs a manager who didn't make the sale to approve it with their PIN, a reason, and for cash the tick that the money went back."],
  refund_decided: ["CONFLICT", "That refund has already been decided."],
  bill_fixed: ["CONFLICT", "A bill can't be changed once issued. Cancel it and make a new one."],
  pay_link_fixed: ["CONFLICT", "That payment link can't be changed. Cancel it and send a new one."],
  station_fixed: ["CONFLICT", "A station can't be changed once set up. Revoke it and set up the computer again."],
  session_ended: ["CONFLICT", "That sign-in has already ended. Tap your name to start again."],
  card_photos_full: ["CONFLICT", "This place holds up to 4 photos. Remove one first."],
  change_needs_approval: ["FORBIDDEN", "Only the General Manager or the Owner can apply a change before it's paid, and they must give a reason."],
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
  if (token === "check" || token === "foreign_key") return new AppError("VALIDATION", "Some details aren't valid. Check the highlighted fields and try again.", { cause: err });
  return new AppError("INTERNAL", "Something went wrong. Please try again.", { cause: err });
}

export function cleanSearch(q: string | undefined | null): string {
  return (q ?? "").replace(/[%_\\]/g, "").trim().slice(0, 60);
}
