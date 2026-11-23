import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getDb } from "./db";
import { hitRateLimit } from "./domain/system";

export function networkOf(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

const hashed = (value: string) => createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? ""}:${value}`).digest("hex").slice(0, 32);

async function visitorKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return hashed(networkOf(ip));
}

async function hit(key: string, action: string, limit: number, windowSeconds: number, message: string) {
  let allowed: boolean;
  try {
    allowed = await hitRateLimit(await getDb(), key, limit, windowSeconds);
  } catch (err) {
    logger.error("rate_limit.check_failed", err, { action });
    return;
  }
  if (!allowed) {
    logger.warn("rate_limit.blocked", { action });
    throw new AppError("RATE_LIMITED", message);
  }
}

export async function enforceRateLimit(action: string, limit: number, windowSeconds: number) {
  await hit(`${action}:${await visitorKey()}`, action, limit, windowSeconds, "Too many attempts from this connection. Please wait a little and try again, or contact the hotel.");
}

export async function enforceSubjectLimit(action: string, subject: string, limit: number, windowSeconds: number) {
  await hit(`${action}:s:${hashed(subject)}`, action, limit, windowSeconds, "Too many attempts for this email. Please wait an hour and try again, or contact the hotel.");
}

export const limits = {
  holdsPerHour: Number(process.env.RATE_LIMIT_HOLDS_PER_HOUR ?? 6),
  paymentsPerHour: Number(process.env.RATE_LIMIT_PAYMENTS_PER_HOUR ?? 20),
};
