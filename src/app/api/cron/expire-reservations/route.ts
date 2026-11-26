import { timingSafeEqual } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { alert } from "@/lib/alert";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db";
import { paymentsToSweep } from "@/server/domain/payments";
import { findingsToAlert } from "@/server/domain/self-check";
import { expireUnpaidReservations } from "@/server/domain/reservations";
import { deliverEmails } from "@/server/notifications";
import { settlePaystackReference } from "@/server/payment-flow";

export async function GET(request: NextRequest) {
  // Never run while building: there is no request, and the build has no secrets.
  await connection();
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

  // Self-check (rules section 4): one alert per run listing what's new, each problem at most once a day.
  let problems = 0;
  try {
    const findings = await findingsToAlert(db);
    problems = findings.length;
    if (findings.length === 1) await alert("self_check", findings[0]!.message, { check: findings[0]!.check });
    else if (findings.length > 1) {
      const urgent = findings.filter((f) => f.urgent).length;
      await alert("self_check", `${findings.length} things need attention${urgent ? ` (${urgent} urgent)` : ""}:\n${findings.slice(0, 15).map((f) => `• ${f.message}`).join("\n")}${findings.length > 15 ? `\n…and ${findings.length - 15} more on the Dashboard.` : ""}`, { checks: [...new Set(findings.map((f) => f.check))] });
    }
  } catch (err) {
    logger.error("cron.self_check_failed", err);
  }

  logger.info("cron.housekeeping", { checked: pending.length, settled, expired, emails, problems });
  return NextResponse.json({ checked: pending.length, settled, expired, emails, problems });
}
