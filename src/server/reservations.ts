"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";
import { throwDbError } from "./db-errors";
import { deliverEmails } from "./notifications";

/** Runs an action body with consistent error handling and logging. */
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
});

/** Direct booking (walk-in, phone, WhatsApp) through the same engine as the website. */
export async function createReservation(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await run("reservation.create", async () => {
    await authorize("reservations.manage");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_staff_reservation", {
      p_category_id: v.categoryId, p_check_in: v.checkIn, p_check_out: v.checkOut, p_guests: v.guests, p_source: v.source,
      p_full_name: v.fullName, p_phone: v.phone, p_email: v.email || undefined, p_special_requests: v.specialRequests || undefined,
    });
    if (error) throwDbError(error);
    refresh();
    return { id: data![0]!.id };
  });
  if (result.ok) redirect(`/app/reservations/${result.data.id}?created=1`);
  return result;
}

export async function assignRoom(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.assign_room", async () => {
    await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const roomId = z.uuid("Choose a room").safeParse(formData.get("roomId"));
    if (!roomId.success) throw new AppError("VALIDATION", "Choose a room");
    const { error } = await (await createClient()).rpc("assign_room", { p_reservation_id: reservationId, p_room_id: roomId.data });
    if (error) throwDbError(error);
    refresh();
  });
}

export async function checkIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.check_in", async () => {
    await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const { error } = await (await createClient()).rpc("check_in_reservation", { p_reservation_id: reservationId });
    if (error) throwDbError(error);
    refresh();
  });
}

export async function checkOut(_prev: ActionResult<{ balanceKobo: number }> | null, formData: FormData): Promise<ActionResult<{ balanceKobo: number }>> {
  return run("reservation.check_out", async () => {
    await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const { data, error } = await (await createClient()).rpc("check_out_reservation", { p_reservation_id: reservationId });
    if (error) throwDbError(error);
    refresh();
    return { balanceKobo: Number(data ?? 0) };
  });
}

export async function cancelReservation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.cancel", async () => {
    await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const reason = String(formData.get("reason") ?? "").trim();
    const { error } = await (await createClient()).rpc("cancel_reservation", { p_reservation_id: reservationId, p_reason: reason });
    if (error) throwDbError(error);
    after(() => deliverEmails({ reservationId }));
    refresh();
  });
}

export async function markNoShow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.no_show", async () => {
    await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const { error } = await (await createClient()).rpc("mark_no_show", { p_reservation_id: reservationId });
    if (error) throwDbError(error);
    refresh();
  });
}

export async function overridePayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.override", async () => {
    await authorize("payments.override");
    const reservationId = id.parse(formData.get("reservationId"));
    const action = z.enum(["confirm", "extend"]).parse(formData.get("action"));
    const reason = String(formData.get("reason") ?? "").trim();
    const { error } = await (await createClient()).rpc("override_payment_requirement", {
      p_reservation_id: reservationId, p_action: action, p_reason: reason, p_extend_hours: 24,
    });
    if (error) throwDbError(error);
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
    await authorize("reservations.manage");
    const v = detailsSchema.parse(Object.fromEntries(formData));
    const { error } = await (await createClient()).rpc("update_reservation_details", {
      p_reservation_id: v.reservationId, p_guests: v.guests, p_special_requests: v.specialRequests,
    });
    if (error) throwDbError(error);
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
    await authorize("guests.manage");
    const parsed = guestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const { data, error } = await (await createClient())
      .from("guests")
      .update({ full_name: v.fullName, phone: v.phone || null, email: v.email ? v.email.toLowerCase() : null, notes: v.notes || null })
      .eq("id", v.guestId)
      .select("id");
    if (error) {
      if (error.code === "23505") throw new AppError("CONFLICT", "Another guest already uses this email.");
      throwDbError(error);
    }
    if (!data?.length) throw new AppError("NOT_FOUND", "Guest not found.");
    refresh();
  });
}

export async function changeDates(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.change_dates", async () => {
    await authorize("reservations.manage");
    const reservationId = id.parse(formData.get("reservationId"));
    const checkIn = isoDate.safeParse(formData.get("checkIn"));
    const checkOut = isoDate.safeParse(formData.get("checkOut"));
    if (!checkIn.success || !checkOut.success) throw new AppError("VALIDATION", "Choose both dates");
    const { error } = await (await createClient()).rpc("change_reservation_dates", {
      p_reservation_id: reservationId, p_check_in: checkIn.data, p_check_out: checkOut.data,
    });
    if (error) throwDbError(error);
    refresh();
  });
}

export async function resolveAttention(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("reservation.resolve_attention", async () => {
    await authorize("payments.override");
    const reservationId = id.parse(formData.get("reservationId"));
    const { error } = await (await createClient()).rpc("resolve_attention", { p_reservation_id: reservationId, p_note: String(formData.get("note") ?? "") });
    if (error) throwDbError(error);
    refresh();
  });
}
