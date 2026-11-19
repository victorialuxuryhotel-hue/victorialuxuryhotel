import "server-only";
import { logger } from "./logger";

/**
 * Operational alerts for things a person must act on: a payment needing
 * attention, an email that finally failed, a webhook or scheduled job error.
 * Posts to ALERT_WEBHOOK_URL (Slack- or Discord-compatible incoming webhook)
 * when configured, and always logs. Never throws, never blocks for long.
 * Messages must not contain card data, tokens or full guest contact details.
 */
export async function alert(event: string, message: string, context: Record<string, unknown> = {}) {
  logger.error(`alert.${event}`, undefined, { message, ...context });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const text = `⚠️ Victoria Hotel: ${message}${context.reference ? ` (${context.reference})` : ""}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.error("alert.delivery_failed", err, { event });
  }
}
