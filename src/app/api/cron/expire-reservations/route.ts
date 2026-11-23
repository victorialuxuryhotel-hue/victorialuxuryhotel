import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { alert } from "@/lib/alert";
import { logger } from "@/lib/logger";
import { all, getDb } from "@/server/db";
import { expireUnpaidReservations } from "@/server/domain/reservations";
import { deliverEmails } from "@/server/notifications";
import { settlePaystackReference } from "@/server/payment-flow";

export async function GET(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret()}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const pending = await all<{ provider_reference: string }>(
    db,
    `SELECT provider_reference FROM payments
     WHERE provider = 'paystack' AND status = 'pending' AND created_at >= ? AND created_at <= ?
     ORDER BY created_at LIMIT 50`,
    new Date(Date.now() - 48 * 3600_000).toISOString(),
    new Date(Date.now() - 30 * 60_000).toISOString(),
  );

  const settled: Record<string, number> = {};
  for (const p of pending) {
    try {
      const outcome = await settlePaystackReference(p.provider_reference, "sweep");
      settled[outcome] = (settled[outcome] ?? 0) + 1;
    } catch (err) {
      logger.error("cron.settle_failed", err, { reference: p.provider_reference });
    }
  }

  let expired: number;
  try {
    expired = await expireUnpaidReservations(db);
  } catch (err) {
    logger.error("cron.expire_failed", err);
    await alert("cron_failed", "The scheduled job could not expire unpaid bookings", { error: err instanceof Error ? err.message : "error" });
    return NextResponse.json({ error: "expire failed" }, { status: 500 });
  }
  const emails = await deliverEmails({ limit: 50 });
  logger.info("cron.housekeeping", { checked: pending.length, settled, expired, emails });
  return NextResponse.json({ checked: pending.length, settled, expired, emails });
}
