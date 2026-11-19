import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";

/**
 * Minimal Paystack client: initialize a transaction, verify one, and check
 * webhook signatures. Only server code calls Paystack; the secret key never
 * reaches the browser. https://paystack.com/docs/api/transaction
 */

type Envelope<T> = { status: boolean; message: string; data: T };

/** Paystack has no record of this reference (e.g. the guest never reached checkout). */
export class PaystackNotFoundError extends Error {
  constructor(reference: string) {
    super(`Paystack has no transaction ${reference}`);
    this.name = "PaystackNotFoundError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${serverEnv.paystackBaseUrl()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${serverEnv.paystackSecretKey()}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.status) {
    logger.error("paystack.request_failed", undefined, { path: path.split("?")[0], httpStatus: res.status, message: body?.message });
    throw new Error(`Paystack request failed (${res.status})`);
  }
  return body.data;
}

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<{ authorizationUrl: string }> {
  const data = await call<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });
  return { authorizationUrl: data.authorization_url };
}

export type VerifiedTransaction = {
  reference: string;
  status: string; // success | failed | abandoned | ongoing | pending | reversed ...
  amountKobo: number;
  currency: string;
  paidAt: string | null;
  channel: string | null;
  gatewayResponse: string | null;
};

/** The authoritative answer about a transaction, straight from Paystack. */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const res = await fetch(`${serverEnv.paystackBaseUrl()}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${serverEnv.paystackSecretKey()}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  type Tx = { reference: string; status: string; amount: number; currency: string; paid_at: string | null; channel: string | null; gateway_response: string | null };
  const body = (await res.json().catch(() => null)) as Envelope<Tx> | null;
  if (!res.ok || !body?.status) {
    if ((res.status === 400 || res.status === 404) && /not found/i.test(body?.message ?? "")) throw new PaystackNotFoundError(reference);
    logger.error("paystack.request_failed", undefined, { path: "/transaction/verify", httpStatus: res.status, message: body?.message });
    throw new Error(`Paystack verify failed (${res.status})`);
  }
  const d = body.data;
  return {
    reference: d.reference,
    status: d.status,
    amountKobo: d.amount,
    currency: d.currency,
    paidAt: d.paid_at,
    channel: d.channel,
    gatewayResponse: d.gateway_response,
  };
}

/** Paystack signs each webhook body with HMAC-SHA512 using the secret key. */
export function isValidWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", serverEnv.paystackSecretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
