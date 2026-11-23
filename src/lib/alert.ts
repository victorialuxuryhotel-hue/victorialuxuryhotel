import "server-only";
import { logger } from "./logger";

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
