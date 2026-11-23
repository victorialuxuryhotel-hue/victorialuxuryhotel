"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { recordOfflinePayment as record, recordPaymentCorrection } from "./domain/payments";
import { deliverEmails } from "./notifications";

const schema = z.object({
  reservationId: z.uuid(),
  paymentId: z.uuid().optional(),
  amount: z.coerce.number({ error: "Enter the amount received" }).positive("Enter the amount received").max(100_000_000),
  method: z.enum(["cash", "bank_transfer", "pos_terminal", "other"], { error: "Choose how it was paid" }),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date received"),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  confirmReceived: z.literal("on", { error: "Confirm the hotel has received this money" }),
});

/**
 * Records money received directly by the hotel. The database insists on the
 * confirmation too; amounts are entered in naira and stored in kobo.
 */
export async function recordOfflinePayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let target: string;
  try {
    const staff = await authorize("payments.record");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const amountKobo = Math.round(v.amount * 100);
    const row = await record(await getDb(), actorOf(staff), {
      reservationId: v.reservationId, paymentId: v.paymentId, amountKobo, method: v.method, reference: v.reference ?? null,
      paidOn: v.paidOn, notes: v.notes ?? null, confirmReceived: true,
    });

    // Emails were queued in the same transaction; send them after responding.
    after(() => deliverEmails({ reservationId: v.reservationId }));

    refresh();
    target = `/app/reservations/${v.reservationId}?paid=${encodeURIComponent(row.receiptNumber)}`;
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("payment.record_failed", err);
    return toActionError(err);
  }
  redirect(target);
}

const correctionSchema = z.object({
  paymentId: z.uuid(),
  reservationId: z.uuid(),
  amount: z.coerce.number({ error: "Enter the amount to correct" }).positive("Enter the amount to correct").max(100_000_000),
  reason: z.string().trim().min(5, "Say what was wrong").max(500),
});

/** Managers: correct a recorded payment (never edit it). */
export async function correctPayment(_prev: ActionResult<{ receiptNumber: string }> | null, formData: FormData): Promise<ActionResult<{ receiptNumber: string }>> {
  try {
    const staff = await authorize("payments.override");
    const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const result = await recordPaymentCorrection(await getDb(), actorOf(staff), { paymentId: v.paymentId, amountKobo: Math.round(v.amount * 100), reason: v.reason });
    refresh();
    return { ok: true, data: { receiptNumber: result.receiptNumber } };
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("payment.correct_failed", err);
    return toActionError(err);
  }
}
