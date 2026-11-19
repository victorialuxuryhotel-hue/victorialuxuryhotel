import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlePaystackReference } from "@/server/payment-flow";

/**
 * Where Paystack sends the guest's browser after checkout. The query string is
 * only a hint about WHICH payment to look at: we verify it with Paystack
 * server-side and never trust the browser about the outcome.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  if (!reference || !/^[a-z0-9-]{8,80}$/i.test(reference)) return NextResponse.redirect(new URL("/book", request.url));

  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("reservation:reservations!inner(public_token)")
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (!payment) return NextResponse.redirect(new URL("/book", request.url));

  try {
    await settlePaystackReference(reference, "callback");
  } catch (err) {
    // The webhook or the confirmation page will settle it; the guest sees "confirming".
    logger.error("payment.callback_settle_failed", err, { reference });
  }
  return NextResponse.redirect(new URL(`/book/confirmation/${payment.reservation.public_token}`, request.url));
}
