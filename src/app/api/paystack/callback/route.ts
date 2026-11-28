import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { first, getDb } from "@/server/db";
import { settlePaystackReference } from "@/server/payment-flow";
import { billChargeParts } from "@/server/domain/pay-links";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  if (!reference || !/^[a-z0-9-]{8,80}$/i.test(reference)) return NextResponse.redirect(new URL("/book", request.url));

  const db = await getDb();
  // A company bill paid online goes back to its pay page, which then shows it paid.
  const bill = await billChargeParts(db, reference);
  if (bill) {
    try {
      await settlePaystackReference(reference, "callback");
    } catch (err) {
      logger.error("payment.callback_settle_failed", err, { reference });
    }
    return NextResponse.redirect(new URL(`/pay/${bill.code}`, request.url));
  }
  const payment = await first<{ public_token: string }>(
    db,
    `SELECT r.public_token FROM payments p JOIN reservations r ON r.id = p.reservation_id
     WHERE p.provider = 'paystack' AND p.provider_reference = ?`,
    reference,
  );
  if (!payment) return NextResponse.redirect(new URL("/book", request.url));

  try {
    await settlePaystackReference(reference, "callback");
  } catch (err) {
    logger.error("payment.callback_settle_failed", err, { reference });
  }
  return NextResponse.redirect(new URL(`/book/confirmation/${payment.public_token}`, request.url));
}
