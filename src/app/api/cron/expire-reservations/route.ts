import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { alert } from "@/lib/alert";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverEmails } from "@/server/notifications";
import { settlePaystackReference } from "@/server/payment-flow";

/**
 * Scheduled housekeeping, called by the Cloudflare Cron Trigger in worker.ts with
 * `Authorization: Bearer $CRON_SECRET`:
 *  1. Re-verify Paystack attempts still pending after 30 minutes, so a payment
 *     whose webhook was delayed or lost is still settled, and attempts that
 *     never reached Paystack are closed as abandoned (reconciliation).
 *  2. Mark unpaid holds that have lapsed as expired.
 *  3. Send (or retry) queued emails.
 * Order matters: settle first, so a guest who paid is never expired.
 */
export async function GET(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret()}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: pending } = await db
    .from("payments")
    .select("provider_reference")
    .eq("provider", "paystack")
    .eq("status", "pending")
    .gte("created_at", since)
    .lte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(50);

  const settled: Record<string, number> = {};
  for (const p of pending ?? []) {
    try {
      const outcome = await settlePaystackReference(p.provider_reference!, "sweep");
      settled[outcome] = (settled[outcome] ?? 0) + 1;
    } catch (err) {
      logger.error("cron.settle_failed", err, { reference: p.provider_reference });
    }
  }

  const { data: expired, error } = await db.rpc("expire_unpaid_reservations");
  if (error) {
    await alert("cron_failed", "The scheduled job could not expire unpaid bookings", { error: error.message });
    return NextResponse.json({ error: "expire failed" }, { status: 500 });
  }
  const emails = await deliverEmails({ limit: 50 });
  logger.info("cron.housekeeping", { checked: pending?.length ?? 0, settled, expired, emails });
  return NextResponse.json({ checked: pending?.length ?? 0, settled, expired, emails });
}
