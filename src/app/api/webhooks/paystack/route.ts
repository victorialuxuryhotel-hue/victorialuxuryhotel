import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { alert } from "@/lib/alert";
import { logger } from "@/lib/logger";
import { first, getDb } from "@/server/db";
import { settlePaystackReference } from "@/server/payment-flow";
import { isValidWebhookSignature } from "@/server/paystack";

const HANDLED = new Set(["charge.success", "charge.failed"]);

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!isValidWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    logger.warn("webhook.paystack_bad_signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const type = String(event.event ?? "unknown");
  const d = (event.data ?? {}) as Record<string, unknown>;
  const reference = typeof d.reference === "string" ? d.reference : null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const db = await getDb();

  const payload = {
    event: type,
    data: { reference, status: String(d.status ?? ""), amount: Number(d.amount ?? 0), currency: String(d.currency ?? ""), paid_at: d.paid_at ? String(d.paid_at) : null, channel: d.channel ? String(d.channel) : null, gateway_response: d.gateway_response ? String(d.gateway_response) : null },
  };
  let eventId: number | undefined;
  try {
    const inserted = await db
      .prepare(
        `INSERT INTO payment_events (provider, event_type, provider_reference, payload_hash, payload) VALUES ('paystack', ?, ?, ?, ?)
         ON CONFLICT (payload_hash) DO NOTHING RETURNING id`,
      )
      .bind(type, reference, hash, JSON.stringify(payload))
      .first<{ id: number }>();
    eventId = inserted?.id;
  } catch (err) {
    logger.error("webhook.paystack_store_failed", err);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  if (!eventId) {
    const existing = await first<{ id: number; processed_at: string | null }>(db, "SELECT id, processed_at FROM payment_events WHERE payload_hash = ?", hash);
    if (existing?.processed_at) return NextResponse.json({ received: true, duplicate: true });
    eventId = existing?.id; // stored but not processed (an earlier attempt failed): process now
  }
  const mark = (processingError: string | null, processed: boolean) =>
    db
      .prepare("UPDATE payment_events SET processed_at = CASE WHEN ? THEN ? ELSE processed_at END, processing_error = ? WHERE id = ?")
      .bind(processed ? 1 : 0, new Date().toISOString(), processingError, eventId)
      .run();

  if (!HANDLED.has(type) || !reference) {
    await mark(null, true);
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const outcome = await settlePaystackReference(reference, "webhook");
    await mark(outcome === "unknown_reference" ? "unknown reference" : null, true);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    logger.error("webhook.paystack_process_failed", err, { reference });
    await alert("webhook_failed", "A Paystack payment notification could not be processed (Paystack will retry)", { reference });
    await mark(err instanceof Error ? err.message.slice(0, 500) : "error", false);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
