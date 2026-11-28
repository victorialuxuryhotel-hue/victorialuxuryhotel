import "server-only";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { first, getDb } from "./db";
import { applyPaystackResult, type SettleOutcome as DbOutcome } from "./domain/payments";
import { billChargeParts } from "./domain/pay-links";
import { markBillLinksPaid } from "./domain/bills";
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
  // A company bill paid online: one charge, settled as one payment per booking (each with its own receipt).
  const bill = await billChargeParts(db, reference);
  if (bill) {
    const total = bill.parts.reduce((n, p) => n + p.amountKobo, 0);
    const outcomes: SettleOutcome[] = [];
    for (const part of bill.parts) {
      outcomes.push(
        await applyPaystackResult(db, {
          reference: part.reference,
          status: tx.status,
          // A charge that doesn't match the bill's total is flagged on every booking for a person to check.
          amountKobo: tx.status === "success" && tx.amountKobo !== total ? tx.amountKobo : part.amountKobo,
          currency: tx.currency,
          paidAt: tx.paidAt ?? new Date().toISOString(),
          channel: tx.channel ?? null,
          gatewayResponse: tx.gatewayResponse ?? null,
        }),
      );
    }
    logger.info("payment.settled", { reference, trigger, paystackStatus: tx.status, outcome: outcomes.join(","), bill: true });
    const link = await first<{ bill_id: string }>(db, "SELECT bill_id FROM pay_links WHERE code = ?", bill.code);
    const last = await first<{ id: string }>(db, "SELECT id FROM payments WHERE provider = 'paystack' AND provider_reference LIKE ? AND status = 'successful' ORDER BY provider_reference DESC LIMIT 1", `${reference}-%`);
    if (link?.bill_id) await markBillLinksPaid(db, link.bill_id, last?.id ?? null);
    if (outcomes.includes("amount_mismatch")) await alert("payment_attention", "A company bill was paid online with an amount that doesn't match the bill", { reference });
    after(() => deliverEmails({}));
    return outcomes.find((o) => o === "confirmed") ?? outcomes[0] ?? "unknown_reference";
  }
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
    amount_mismatch: "Paystack reported a payment that doesn't match the amount owed",
    paid_unavailable: "A guest paid after their hold expired and the room type is now full",
    paid_closed: "Payment received for a cancelled booking",
    overpaid: "A booking has been paid more than once",
  };
  const bookingRef = reference.split("-").slice(0, 2).join("-").toUpperCase();
  if (attention[outcome]) await alert("payment_attention", attention[outcome]!, { reference: bookingRef });
  return outcome;
}
