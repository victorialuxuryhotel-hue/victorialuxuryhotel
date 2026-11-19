import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Each integration validates its own keys when first used,
 * so the site can run (e.g. browsing pages locally) before every external
 * account is configured, while a payment or email call fails loudly if its
 * credentials are missing.
 */
function read<T extends z.ZodType>(name: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env[name]);
  if (!parsed.success) {
    throw new Error(`Missing or invalid server environment variable ${name}`);
  }
  return parsed.data;
}

const nonEmpty = z.string().min(1);

export const serverEnv = {
  supabaseSecretKey: () => read("SUPABASE_SECRET_KEY", nonEmpty),
  paystackSecretKey: () => read("PAYSTACK_SECRET_KEY", z.string().regex(/^sk_(test|live)_/)),
  resendApiKey: () => read("RESEND_API_KEY", nonEmpty),
  emailFrom: () => read("EMAIL_FROM", nonEmpty),
  cronSecret: () => read("CRON_SECRET", z.string().min(16)),
  /** Overridable only so tests can point at a local mock; production uses the default. */
  // A live key always talks to the real Paystack API, whatever the override says.
  paystackBaseUrl: () =>
    process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "https://api.paystack.co" : process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  resendBaseUrl: () => process.env.RESEND_BASE_URL || "https://api.resend.com",
  /** Hotel inbox that receives a copy of new-booking notifications (optional). */
  hotelNotifyEmail: () => process.env.HOTEL_NOTIFY_EMAIL || null,
};
