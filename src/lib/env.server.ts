import "server-only";
import { z } from "zod";

function read<T extends z.ZodType>(name: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env[name]);
  if (!parsed.success) {
    throw new Error(`Missing or invalid server environment variable ${name}`);
  }
  return parsed.data;
}

const nonEmpty = z.string().min(1);

export const serverEnv = {
  paystackSecretKey: () => read("PAYSTACK_SECRET_KEY", z.string().regex(/^sk_(test|live)_/)),
  resendApiKey: () => read("RESEND_API_KEY", nonEmpty),
  emailFrom: () => read("EMAIL_FROM", nonEmpty),
  cronSecret: () => read("CRON_SECRET", z.string().min(16)),
  paystackBaseUrl: () =>
    process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "https://api.paystack.co" : process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  resendBaseUrl: () => process.env.RESEND_BASE_URL || "https://api.resend.com",
  hotelNotifyEmail: () => process.env.HOTEL_NOTIFY_EMAIL || null,
};
