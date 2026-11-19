import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { alert } from "@/lib/alert";
import { logger } from "@/lib/logger";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlePaystackReference } from "@/server/payment-flow";
import { isValidWebhookSignature } from "@/server/paystack";

const HANDLED = new Set(["charge.success", "charge.failed"]);

/**
 * Paystack webhook. Verifies the HMAC signature over the raw body, stores the
 * event once (retries carry an identical body, so the hash de-duplicates them),
 * then settles the payment via the verify API. Returns 500 on processing
 * errors so Paystack retries; a retry of an already-processed event is a no-op.
 */
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
  const db = createAdminClient();

  // Store only what's needed to investigate: no card authorization details.
  const payload: Json = {
    event: type,
    data: { reference, status: String(d.status ?? ""), amount: Number(d.amount ?? 0), currency: String(d.currency ?? ""), paid_at: d.paid_at ? String(d.paid_at) : null, channel: d.channel ? String(d.channel) : null, gateway_response: d.gateway_response ? String(d.gateway_response) : null },
  };
  const { data: inserted, error } = await db
    .from("payment_events")
    .upsert({ provider: "paystack", event_type: type, provider_reference: reference, payload_hash: hash, payload }, { onConflict: "payload_hash", ignoreDuplicates: true })
    .select("id");
  if (error) {
    logger.error("webhook.paystack_store_failed", error);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  let eventId = inserted?.[0]?.id;
  if (!eventId) {
    const { data: existing } = await db.from("payment_events").select("id, processed_at").eq("payload_hash", hash).single();
    if (existing?.processed_at) return NextResponse.json({ received: true, duplicate: true });
    eventId = existing?.id; // stored but not processed (an earlier attempt failed): process now
  }

  if (!HANDLED.has(type) || !reference) {
    await db.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId!);
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const outcome = await settlePaystackReference(reference, "webhook");
    await db.from("payment_events").update({ processed_at: new Date().toISOString(), processing_error: outcome === "unknown_reference" ? "unknown reference" : null }).eq("id", eventId!);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    logger.error("webhook.paystack_process_failed", err, { reference });
    await alert("webhook_failed", "A Paystack payment notification could not be processed (Paystack will retry)", { reference });
    await db.from("payment_events").update({ processing_error: err instanceof Error ? err.message.slice(0, 500) : "error" }).eq("id", eventId!);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
