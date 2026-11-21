import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getDb } from "./db";
import { hitRateLimit } from "./domain/system";

/**
 * Per-visitor limits for anonymous website actions that hold inventory or call
 * Paystack. The visitor is identified by IP, stored only as a salted hash.
 * On Cloudflare the client IP comes from CF-Connecting-IP, which Cloudflare
 * sets itself; X-Forwarded-For can be supplied by the client, so it is only a
 * fallback for local development. Fails OPEN if the limiter itself errors: a
 * database hiccup must not stop genuine guests booking.
 */
async function visitorKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = process.env.RATE_LIMIT_SALT ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function enforceRateLimit(action: string, limit: number, windowSeconds: number) {
  const key = `${action}:${await visitorKey()}`;
  let allowed: boolean;
  try {
    allowed = await hitRateLimit(await getDb(), key, limit, windowSeconds);
  } catch (err) {
    logger.error("rate_limit.check_failed", err, { action });
    return;
  }
  if (!allowed) {
    logger.warn("rate_limit.blocked", { action });
    throw new AppError("RATE_LIMITED", "Too many attempts from this connection. Please wait a little and try again, or contact the hotel.");
  }
}

/** Limits are configurable so automated tests (which book many times) can raise them. */
export const limits = {
  holdsPerHour: Number(process.env.RATE_LIMIT_HOLDS_PER_HOUR ?? 6),
  paymentsPerHour: Number(process.env.RATE_LIMIT_PAYMENTS_PER_HOUR ?? 20),
};
