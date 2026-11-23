import "server-only";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";

export type Email = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };

export async function sendEmail(email: Email): Promise<boolean> {
  if (!allowed(email.to)) {
    logger.info("email.held_not_allowlisted", { to: redact(email.to), subject: email.subject });
    return true;
  }
  if (!process.env.RESEND_API_KEY) {
    logger.info("email.skipped_no_api_key", { to: redact(email.to), subject: email.subject });
    return false;
  }
  try {
    const res = await fetch(`${serverEnv.resendBaseUrl()}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.resendApiKey()}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: serverEnv.emailFrom(), to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.error("email.send_failed", undefined, { status: res.status, subject: email.subject, to: redact(email.to) });
      return false;
    }
    logger.info("email.sent", { subject: email.subject, to: redact(email.to) });
    return true;
  } catch (err) {
    logger.error("email.send_failed", err, { subject: email.subject, to: redact(email.to) });
    return false;
  }
}

export function allowed(address: string, list = process.env.EMAIL_ALLOWLIST): boolean {
  if (list === undefined || list.trim() === "") return true;
  const entries = list.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (entries.includes("none")) return false;
  return entries.includes(address.trim().toLowerCase());
}

function redact(address: string) {
  const [user = "", domain = ""] = address.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}
