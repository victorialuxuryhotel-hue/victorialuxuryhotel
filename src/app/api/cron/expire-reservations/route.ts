import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { alert } from "@/lib/alert";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db";
import { paymentsToSweep } from "@/server/domain/payments";
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
  const pending = await paymentsToSweep(db);

  const settled: Record<string, number> = {};
  for (const reference of pending) {
    try {
      const outcome = await settlePaystackReference(reference, "sweep");
      settled[outcome] = (settled[outcome] ?? 0) + 1;
    } catch (err) {
      logger.error("cron.settle_failed", err, { reference });
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
