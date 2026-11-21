import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { first, getDb } from "@/server/db";
import { settlePaystackReference } from "@/server/payment-flow";

/**
 * Where Paystack sends the guest's browser after checkout. The query string is
 * only a hint about WHICH payment to look at: we verify it with Paystack
 * server-side and never trust the browser about the outcome.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  if (!reference || !/^[a-z0-9-]{8,80}$/i.test(reference)) return NextResponse.redirect(new URL("/book", request.url));

  const payment = await first<{ public_token: string }>(
    await getDb(),
    `SELECT r.public_token FROM payments p JOIN reservations r ON r.id = p.reservation_id
     WHERE p.provider = 'paystack' AND p.provider_reference = ?`,
    reference,
  );
  if (!payment) return NextResponse.redirect(new URL("/book", request.url));

  try {
    await settlePaystackReference(reference, "callback");
  } catch (err) {
    // The webhook or the confirmation page will settle it; the guest sees "confirming".
    logger.error("payment.callback_settle_failed", err, { reference });
  }
  return NextResponse.redirect(new URL(`/book/confirmation/${payment.public_token}`, request.url));
}
