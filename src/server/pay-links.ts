"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordId } from "@/lib/ids";
import { publicEnv } from "@/lib/env";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { beginBillPayment, billLinkView, createBillPayLink, createPayLink, tokenForPayment, type PayLink } from "./domain/pay-links";
import { beginPaystackPayment } from "./domain/payments";
import { initializeTransaction } from "./paystack";
import { enforceRateLimit, limits } from "./rate-limit";

/** The desk makes a payment link for a booking (X14). Sending is done by the staff member's WhatsApp or email. */
export async function makePayLink(reservationId: string): Promise<ActionResult<PayLink>> {
  try {
    const staff = await authorize("paylinks.create");
    return ok(await createPayLink(await getDb(), actorOf(staff), recordId().parse(reservationId), publicEnv().NEXT_PUBLIC_SITE_URL));
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("paylink.create_failed", err);
    return toActionError(err);
  }
}

/** The guest's Pay button (M14): the same Paystack flow as the website, for the booking behind the link. */
export async function payByLink(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let authorizationUrl: string;
  try {
    const code = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).parse(formData.get("code"));
    await enforceRateLimit("payment", limits.paymentsPerHour, 3600);
    const db = await getDb();
    const email = String(formData.get("email") ?? "") || null;
    if (await billLinkView(db, code)) {
      // A company bill: one charge for what's owed, split into a payment per booking when it succeeds.
      const bill = await beginBillPayment(db, code, email);
      ({ authorizationUrl } = await initializeTransaction({
        email: bill.email,
        amountKobo: bill.amountKobo,
        reference: bill.reference,
        callbackUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/api/paystack/callback`,
        metadata: { bill_number: bill.billNumber, pay_link: "yes" },
      }));
    } else {
      const token = await tokenForPayment(db, code, email);
      const attempt = await beginPaystackPayment(db, token);
      ({ authorizationUrl } = await initializeTransaction({
        email: attempt.email,
        amountKobo: attempt.amountKobo,
        reference: attempt.reference,
        callbackUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/api/paystack/callback`,
        metadata: { reservation_reference: attempt.reservationReference, pay_link: "yes" },
      }));
    }
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("paylink.payment_start_failed", err);
    return err instanceof AppError || err instanceof z.ZodError ? toActionError(err) : { ok: false, code: "PAYMENT", message: "We couldn't reach the payment provider. Please try again in a moment." };
  }
  redirect(authorizationUrl);
}

/** A payment link for a company bill (P3, section 11). */
export async function makeBillPayLink(billId: string): Promise<ActionResult<{ url: string; amountKobo: number }>> {
  try {
    const staff = await authorize("bills.manage");
    const r = await createBillPayLink(await getDb(), actorOf(staff), recordId().parse(billId), publicEnv().NEXT_PUBLIC_SITE_URL);
    return ok({ url: r.url, amountKobo: r.amountKobo });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("paylink.bill_create_failed", err);
    return toActionError(err);
  }
}
