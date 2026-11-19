"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { throwDbError } from "./db-errors";
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
  acceptTerms: z.literal("on", { error: "Please accept the booking terms" }),
});

/**
 * Creates the reservation hold for a website booking. Price and availability
 * are decided by the database; nothing about the amount comes from the browser.
 */
export async function createWebsiteBooking(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let token: string;
  try {
    const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Please check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    // Holds take rooms off sale for a while: limit how many one visitor can create.
    await enforceRateLimit("hold", limits.holdsPerHour, 3600);
    const v = parsed.data;
    const { data, error } = await createAdminClient().rpc("create_website_reservation", {
      p_category_slug: v.category,
      p_check_in: v.checkIn,
      p_check_out: v.checkOut,
      p_guests: v.guests,
      p_full_name: v.fullName,
      p_email: v.email,
      p_phone: v.phone,
      p_special_requests: v.specialRequests || undefined,
    });
    if (error) throwDbError(error, "We couldn't complete your booking. Please try again or contact the hotel.");
    token = data![0]!.public_token;
    logger.info("booking.held", { reference: data![0]!.reference });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("booking.create_failed", err);
    return toActionError(err);
  }
  redirect(`/book/review/${token}`);
}

/**
 * Guest pressed "Pay": create a payment attempt for the balance the DATABASE
 * calculates, then send them to Paystack's checkout.
 */
export async function startPayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let authorizationUrl: string;
  try {
    const token = z.uuid().parse(formData.get("token"));
    await enforceRateLimit("payment", limits.paymentsPerHour, 3600);
    const db = createAdminClient();
    const { data, error } = await db.rpc("begin_paystack_payment", { p_public_token: token });
    if (error) throwDbError(error, "We couldn't start the payment. Please try again.");
    const attempt = data![0]!;
    ({ authorizationUrl } = await initializeTransaction({
      email: attempt.email,
      amountKobo: attempt.amount_kobo,
      reference: attempt.reference,
      callbackUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/api/paystack/callback`,
      metadata: { reservation_reference: attempt.reservation_reference },
    }));
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("booking.payment_start_failed", err);
    return err instanceof AppError ? toActionError(err) : { ok: false, code: "PAYMENT", message: "We couldn't reach the payment provider. Please try again in a moment." };
  }
  redirect(authorizationUrl);
}
