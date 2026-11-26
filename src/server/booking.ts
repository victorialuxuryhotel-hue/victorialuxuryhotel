"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { publicEnv } from "@/lib/env";
import { getDb } from "./db";
import { beginPaystackPayment } from "./domain/payments";
import { createWebsiteReservation } from "./domain/reservations";
import { initializeTransaction } from "./paystack";
import { enforceRateLimit, limits } from "./rate-limit";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bookingSchema = z.object({
  category: z.string().regex(/^[a-z0-9-]{1,60}$/),
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.coerce.number().int().min(1).max(20),
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email address").max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number, e.g. +234 803 000 0000"),
  specialRequests: z.string().max(1000).optional(),
  promoCode: z.string().trim().max(20).optional(),
  acceptTerms: z.literal("on", { error: "Please tick to accept the cancellation policy" }),
});

export async function createWebsiteBooking(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let token: string;
  try {
    const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
    const extraIds = formData.getAll("extra").map(String).filter((id) => z.uuid().safeParse(id).success);
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Please check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    await enforceRateLimit("hold", limits.holdsPerHour, 3600);
    const v = parsed.data;
    const held = await createWebsiteReservation(await getDb(), {
      categorySlug: v.category,
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      guests: v.guests,
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      specialRequests: v.specialRequests || null,
      extraIds,
      promoCode: v.promoCode || null,
    });
    token = held.publicToken;
    logger.info("booking.held", { reference: held.reference });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("booking.create_failed", err);
    return toActionError(err);
  }
  redirect(`/book/review/${token}`);
}

export async function startPayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let authorizationUrl: string;
  try {
    const token = z.uuid().parse(formData.get("token"));
    await enforceRateLimit("payment", limits.paymentsPerHour, 3600);
    const attempt = await beginPaystackPayment(await getDb(), token);
    ({ authorizationUrl } = await initializeTransaction({
      email: attempt.email,
      amountKobo: attempt.amountKobo,
      reference: attempt.reference,
      callbackUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/api/paystack/callback`,
      metadata: { reservation_reference: attempt.reservationReference },
    }));
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("booking.payment_start_failed", err);
    return err instanceof AppError ? toActionError(err) : { ok: false, code: "PAYMENT", message: "We couldn't reach the payment provider. Please try again in a moment." };
  }
  redirect(authorizationUrl);
}
