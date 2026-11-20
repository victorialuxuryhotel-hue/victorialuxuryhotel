"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";
import { throwDbError } from "./db-errors";
import { deliverEmails } from "./notifications";

const schema = z.object({
  reservationId: z.uuid(),
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
    await authorize("payments.record");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const amountKobo = Math.round(v.amount * 100);
    const { data, error } = await (await createClient()).rpc("record_offline_payment", {
      p_reservation_id: v.reservationId, p_amount_kobo: amountKobo, p_method: v.method, p_reference: v.reference ?? "",
      p_paid_on: v.paidOn, p_notes: v.notes ?? "", p_confirm_received: true,
    });
    if (error) throwDbError(error);
    const row = data![0]!;

    // Emails were queued in the same transaction; send them after responding.
    after(() => deliverEmails({ reservationId: v.reservationId }));

    refresh();
    target = `/app/reservations/${v.reservationId}?paid=${encodeURIComponent(row.receipt_number)}`;
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("payment.record_failed", err);
    return toActionError(err);
  }
  redirect(target);
}
