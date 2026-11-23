"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { recordId } from "@/lib/ids";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize, authorizeRead } from "./auth";
import { getDb } from "./db";
import * as engine from "./domain/reservations";
import { availabilityForStay, findGuestsByPhone, type PhoneMatch, type TypeAvailability } from "./domain/staff-booking";
import { deliverEmails } from "./notifications";

async function run<T>(name: string, body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await body());
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(`${name}_failed`, err);
    return toActionError(err);
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const id = z.uuid();

const createSchema = z.object({
  categoryId: z.uuid("Choose a room type"),
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.coerce.number().int().min(1).max(20),
  source: z.enum(["walk_in", "phone", "whatsapp", "staff"]),
  fullName: z.string().trim().min(2, "Enter the guest's full name").max(120),
  phone: z.string().trim().min(7, "Enter a phone number").max(30),
  email: z.union([z.literal(""), z.email("Enter a valid email")]).optional(),
  specialRequests: z.string().max(1000).optional(),
  guestId: z.union([z.literal(""), z.uuid()]).optional(),
  roomId: z.union([z.literal(""), recordId()]).optional(),
  next: z.enum(["payment", "reservation"]).optional(),
});

export async function createReservation(_prev: ActionResult<{ id: string; next: string }> | null, formData: FormData): Promise<ActionResult<{ id: string; next: string }>> {
  const result = await run("reservation.create", async () => {
    const staff = await authorize("reservations.manage");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const res = await engine.createStaffReservation(await getDb(), actorOf(staff), {
      categoryId: v.categoryId, checkIn: v.checkIn, checkOut: v.checkOut, guests: v.guests, source: v.source,
      fullName: v.fullName, phone: v.phone, email: v.email || null, specialRequests: v.specialRequests || null,
      guestId: v.guestId || null,
      roomId: v.roomId || null,
    });
    refresh();
    return { id: res.id, next: v.next ?? "reservation" };
  });
  if (result.ok) redirect(result.data.next === "payment" ? `/app/payments/record?reservation=${result.data.id}&created=1` : `/app/reservations/${result.data.id}?created=1`);
  return result;
}

export type Undoable = { undoId: number | null };

export async function assignRoom(_prev: ActionResult<Undoable> | null, formData: FormData): Promise<ActionResult<Undoable>> {
  return run("reservation.assign_room", async () => {
    const staff = await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const roomId = recordId("Choose a room").safeParse(formData.get("roomId"));
    if (!roomId.success) throw new AppError("VALIDATION", "Choose a room");
    const result = await engine.assignRoom(await getDb(), actorOf(staff), reservationId, roomId.data);
    refresh();
    return result;
  });
}

export async function checkIn(_prev: ActionResult<Undoable> | null, formData: FormData): Promise<ActionResult<Undoable>> {
  return run("reservation.check_in", async () => {
    const staff = await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const result = await engine.checkInReservation(await getDb(), actorOf(staff), reservationId);
    refresh();
    return result;
  });
}

export async function checkOut(_prev: ActionResult<{ balanceKobo: number } & Undoable> | null, formData: FormData): Promise<ActionResult<{ balanceKobo: number } & Undoable>> {
  return run("reservation.check_out", async () => {
    const staff = await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const { balance, undoId } = await engine.checkOutReservation(await getDb(), actorOf(staff), reservationId);
    refresh();
    return { balanceKobo: balance, undoId };
  });
}

export async function cancelReservation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.cancel", async () => {
    const staff = await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const reason = String(formData.get("reason") ?? "").trim();
    await engine.cancelReservation(await getDb(), actorOf(staff), reservationId, reason);
    after(() => deliverEmails({ reservationId }));
    refresh();
  });
}

export async function markNoShow(_prev: ActionResult<Undoable> | null, formData: FormData): Promise<ActionResult<Undoable>> {
  return run("reservation.no_show", async () => {
    const staff = await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const result = await engine.markNoShow(await getDb(), actorOf(staff), reservationId);
    refresh();
    return result;
  });
}

export async function overridePayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.override", async () => {
    const staff = await authorize("payments.override");
    const reservationId = id.parse(formData.get("reservationId"));
    const action = z.enum(["confirm", "extend"]).parse(formData.get("action"));
    const reason = String(formData.get("reason") ?? "").trim();
    await engine.overridePaymentRequirement(await getDb(), actorOf(staff), reservationId, action, reason, 24);
    after(() => deliverEmails({ reservationId }));
    refresh();
  });
}

const detailsSchema = z.object({
  reservationId: z.uuid(),
  guests: z.coerce.number().int().min(1).max(20),
  specialRequests: z.string().max(1000),
});

export async function updateReservationDetails(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.update", async () => {
    const staff = await authorize("reservations.manage");
    const v = detailsSchema.parse(Object.fromEntries(formData));
    await engine.updateReservationDetails(await getDb(), actorOf(staff), v.reservationId, v.guests, v.specialRequests);
    refresh();
  });
}

const guestSchema = z.object({
  guestId: z.uuid(),
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  notes: z.string().max(1000),
});

export async function updateGuest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("guest.update", async () => {
    const staff = await authorize("guests.manage");
    const parsed = guestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    await engine.updateGuest(await getDb(), actorOf(staff), { guestId: v.guestId, fullName: v.fullName, phone: v.phone || null, email: v.email || null, notes: v.notes || null });
    refresh();
  });
}

export async function changeDates(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.change_dates", async () => {
    const staff = await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const checkIn = isoDate.safeParse(formData.get("checkIn"));
    const checkOut = isoDate.safeParse(formData.get("checkOut"));
    if (!checkIn.success || !checkOut.success) throw new AppError("VALIDATION", "Choose both dates");
    await engine.changeReservationDates(await getDb(), actorOf(staff), reservationId, checkIn.data, checkOut.data);
    refresh();
  });
}

export async function resolveAttention(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.resolve_attention", async () => {
    const staff = await authorize("payments.override");
    const reservationId = id.parse(formData.get("reservationId"));
    await engine.resolveAttention(await getDb(), actorOf(staff), reservationId, String(formData.get("note") ?? ""));
    refresh();
  });
}

export async function undoChange(reservationId: string, undoId: number): Promise<ActionResult<{ message: string }>> {
  return run("reservation.undo", async () => {
    const staff = await authorize("reservations.manage");
    id.parse(reservationId);
    const result = await engine.undoAction(await getDb(), actorOf(staff), reservationId, z.number().int().positive().parse(undoId));
    refresh();
    return result;
  });
}

export async function lookupGuestsByPhone(phone: string): Promise<PhoneMatch[]> {
  try {
    const staff = await authorizeRead("reservations.manage");
    return await findGuestsByPhone(await getDb(), actorOf(staff), String(phone).slice(0, 30));
  } catch (err) {
    logger.warn("guest.phone_lookup_failed", { error: err instanceof Error ? err.message : "error" });
    return [];
  }
}

export async function stayAvailability(checkIn: string, checkOut: string): Promise<TypeAvailability[] | null> {
  try {
    const staff = await authorizeRead("reservations.manage");
    return await availabilityForStay(await getDb(), actorOf(staff), String(checkIn), String(checkOut));
  } catch {
    return null;
  }
}
