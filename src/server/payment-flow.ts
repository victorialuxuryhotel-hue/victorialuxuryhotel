import "server-only";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { alert } from "@/lib/alert";
import { deliverEmails } from "./notifications";
import { PaystackNotFoundError, verifyTransaction, type VerifiedTransaction } from "./paystack";

export type SettleOutcome =
  | "confirmed" | "part_paid" | "paid_unavailable" | "paid_closed" | "already_settled" | "already_processed"
  | "amount_mismatch" | "overpaid" | "failed" | "abandoned" | "still_pending" | "unknown_reference";

/**
 * The one path by which a Paystack payment affects a booking. Used by both the
 * browser callback and the webhook. Whatever triggered it, we ask PAYSTACK
 * (verify API) for the truth and apply that; the database function is
 * idempotent and locks the payment, so concurrent callers are safe and only
 * one sees "confirmed", which is the one that sends the confirmation email.
 */
export async function settlePaystackReference(reference: string, trigger: "callback" | "webhook" | "sweep"): Promise<SettleOutcome> {
  let tx: VerifiedTransaction;
  try {
    tx = await verifyTransaction(reference);
  } catch (err) {
    if (!(err instanceof PaystackNotFoundError)) throw err;
    // The guest never reached Paystack. The scheduled sweep closes the attempt;
    // anywhere else, it may simply be too early to tell.
    if (trigger !== "sweep") return "still_pending";
    tx = { reference, status: "abandoned", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: "Never reached Paystack checkout" };
  }
  if (tx.reference !== reference) {
    logger.error("payment.reference_mismatch", undefined, { reference, reported: tx.reference });
    return "unknown_reference";
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("apply_paystack_result", {
    p_reference: reference,
    p_status: tx.status,
    p_amount_kobo: tx.amountKobo,
    p_currency: tx.currency,
    p_paid_at: tx.paidAt ?? new Date().toISOString(),
    p_channel: tx.channel ?? "",
    p_gateway_response: tx.gatewayResponse ?? "",
  });
  if (error) {
    if (error.hint === "NOT_FOUND") return "unknown_reference";
    throw new Error("Could not apply Paystack result", { cause: error });
  }
  const outcome = data as SettleOutcome;
  logger.info("payment.settled", { reference, trigger, paystackStatus: tx.status, outcome });

  // The confirmation email was queued in the same transaction; send it after responding.
  if (outcome === "confirmed") {
    const { data: p } = await db.from("payments").select("reservation_id").eq("provider", "paystack").eq("provider_reference", reference).single();
    after(() => deliverEmails({ reservationId: p?.reservation_id }));
  }

  const attention: Partial<Record<SettleOutcome, string>> = {
    amount_mismatch: "Paystack reported a payment that doesn't match the amount due",
    paid_unavailable: "A guest paid after their hold expired and the room type is now full",
    paid_closed: "Payment received for a cancelled reservation",
    overpaid: "A reservation has been paid more than once",
  };
  // Paystack references are "<booking reference>-<attempt>", e.g. vl-7kq3pm-1a2b3c4d.
  const bookingRef = reference.split("-").slice(0, 2).join("-").toUpperCase();
  if (attention[outcome]) await alert("payment_attention", attention[outcome]!, { reference: bookingRef });
  return outcome;
}
