import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/booking/auto-refresh";
import { BookingConfirmed, PaymentFailed, PaymentPending } from "@/components/booking/outcome";
import { Container } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getBookingByToken, publicBookingRules } from "@/server/queries/booking";
import { settlePaystackReference } from "@/server/payment-flow";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const timeLabel = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h === 12 && m === 0 ? "12:00 noon" : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

async function Outcome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let b = await getBookingByToken(token);
  if (!b) notFound();

  if (b.status === "pending_payment" && b.latestAttempt?.status === "pending" && b.latestAttempt.provider_reference) {
    try {
      await settlePaystackReference(b.latestAttempt.provider_reference, "callback");
      b = (await getBookingByToken(token))!;
    } catch (err) {
      logger.warn("confirmation.settle_retry_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (b.status === "confirmed" || b.status === "checked_in" || b.status === "checked_out") {
    const rules = await publicBookingRules();
    return (
      <BookingConfirmed
        stay={{
          reference: b.reference, guestName: b.guest.full_name, email: b.guest.email ?? "", category: b.roomCategory, room: b.room,
          checkIn: b.check_in, checkOut: b.check_out, nights: b.nights ?? 0, guests: b.guest_count, paidKobo: b.paidKobo,
          receiptNumber: b.receipt ?? "", checkInTime: timeLabel(rules.checkInTime), checkOutTime: timeLabel(rules.checkOutTime),
          token, siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
        }}
      />
    );
  }

  if (b.attention_reason) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="font-display text-4xl text-navy-950">We&apos;re checking your payment</h1>
        <p className="mt-3 text-ink-600">
          Our team is reviewing booking <span className="font-mono">{b.reference}</span> and will contact you shortly. Please don&apos;t pay again. You can reach us on {hotel.phoneDisplay}.
        </p>
      </div>
    );
  }

  if (b.status === "pending_payment" && b.latestAttempt?.status === "pending") {
    return (
      <>
        <AutoRefresh />
        <PaymentPending reference={b.reference} />
      </>
    );
  }

  if (b.status === "pending_payment" && b.holdActive) {
    return <PaymentFailed retryHref={`/book/review/${token}`} />;
  }

  const paid = b.paidKobo > 0;
  return (
    <div className="mx-auto max-w-xl text-center">
      <h1 className="font-display text-4xl text-navy-950">{paid ? "We've received your payment" : "This booking hold has ended"}</h1>
      <p className="mt-3 text-ink-600">
        {paid
          ? `Our team will contact you shortly about booking ${b.reference}. You can also reach us on ${hotel.phoneDisplay}.`
          : "Payment wasn't completed in time, so the room was released. You're welcome to search again."}
      </p>
      <Link href={paid ? "/contact" : "/book"} className={buttonStyles({ className: "mt-8" })}>{paid ? "Contact the hotel" : "Search again"}</Link>
    </div>
  );
}

export default function ConfirmationPage(props: PageProps<"/book/confirmation/[token]">) {
  return (
    <Container className="py-16 sm:py-24">
      <Suspense fallback={<PaymentPending reference="" />}>
        <Outcome params={props.params} />
      </Suspense>
    </Container>
  );
}
