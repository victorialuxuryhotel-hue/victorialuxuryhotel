import "server-only";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { first, getDb } from "./db";
import { applyPaystackResult, type SettleOutcome as DbOutcome } from "./domain/payments";
import { after } from "next/server";
import { alert } from "@/lib/alert";
import { deliverEmails } from "./notifications";
import { PaystackNotFoundError, verifyTransaction, type VerifiedTransaction } from "./paystack";

export type SettleOutcome = DbOutcome | "unknown_reference";

export async function settlePaystackReference(reference: string, trigger: "callback" | "webhook" | "sweep"): Promise<SettleOutcome> {
  let tx: VerifiedTransaction;
  try {
    tx = await verifyTransaction(reference);
  } catch (err) {
    if (!(err instanceof PaystackNotFoundError)) throw err;
    if (trigger !== "sweep") return "still_pending";
    tx = { reference, status: "abandoned", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: "Never reached Paystack checkout" };
  }
  if (tx.reference !== reference) {
    logger.error("payment.reference_mismatch", undefined, { reference, reported: tx.reference });
    return "unknown_reference";
  }

  const db = await getDb();
  let outcome: SettleOutcome;
  try {
    outcome = await applyPaystackResult(db, {
      reference,
      status: tx.status,
      amountKobo: tx.amountKobo,
      currency: tx.currency,
      paidAt: tx.paidAt ?? new Date().toISOString(),
      channel: tx.channel ?? null,
      gatewayResponse: tx.gatewayResponse ?? null,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") return "unknown_reference";
    throw new Error("Could not apply Paystack result", { cause: err });
  }
  logger.info("payment.settled", { reference, trigger, paystackStatus: tx.status, outcome });

  if (outcome === "confirmed") {
    const p = await first<{ reservation_id: string }>(db, "SELECT reservation_id FROM payments WHERE provider = 'paystack' AND provider_reference = ?", reference);
    after(() => deliverEmails({ reservationId: p?.reservation_id }));
  }

  const attention: Partial<Record<SettleOutcome, string>> = {
    amount_mismatch: "Paystack reported a payment that doesn't match the amount due",
    paid_unavailable: "A guest paid after their hold expired and the room type is now full",
    paid_closed: "Payment received for a cancelled reservation",
    overpaid: "A reservation has been paid more than once",
  };
  const bookingRef = reference.split("-").slice(0, 2).join("-").toUpperCase();
  if (attention[outcome]) await alert("payment_attention", attention[outcome]!, { reference: bookingRef });
  return outcome;
}
