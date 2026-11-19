import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const allowedTypes: EmailOtpType[] = ["invite", "recovery"];

/**
 * Landing point for staff invite and password-reset emails. Exchanges the
 * one-time token for a session server-side, then sends the person to set a
 * password. Only internal /app destinations are accepted.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/app/account";
  const next = /^\/app(\/[\w\-/]*)?$/.test(nextParam) ? nextParam : "/app/account";

  if (tokenHash && type && allowedTypes.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    logger.warn("auth.confirm_failed", { type, code: error.code });
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
