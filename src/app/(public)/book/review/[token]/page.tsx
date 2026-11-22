import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Clock } from "lucide-react";
import { BookingSummary, CompactSummary, Steps } from "@/components/booking/booking-ui";
import { Container } from "@/components/public/section";
import { PayButton } from "@/components/booking/pay-button";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { formatDateTime, formatNaira } from "@/lib/format";
import { getBookingByToken } from "@/server/queries/booking";

export const metadata: Metadata = { title: "Review and pay", robots: { index: false, follow: false } };

async function Review({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getBookingByToken(token);
  if (!b) notFound();

  const option = {
    slug: b.category.slug, name: b.category.name, summary: b.category.short_description ?? "", maxOccupancy: b.category.max_occupancy,
    isAvailable: true, nightlyRateKobo: b.nightly_rate_kobo, totalKobo: b.total_amount_kobo, nights: b.nights ?? 0,
  };
  const stay = { checkIn: b.check_in, checkOut: b.check_out, guests: b.guest_count };

  if (b.status === "confirmed") redirect(`/book/confirmation/${token}`);
  if (!b.holdActive) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="font-display text-4xl text-navy-950">This booking hold has ended</h1>
        <p className="mt-3 text-ink-600">Payment wasn&apos;t completed in time, so the room was released. You&apos;re welcome to search again.</p>
        <Link href="/book" className={buttonStyles({ className: "mt-8" })}>Search again</Link>
      </div>
    );
  }

  return (
    <>
      <Steps current={3} />
      <div className="mt-5 grid gap-6 sm:mt-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <CompactSummary option={option} search={stay} />
        <div>
          <h1 className="font-display text-[2.125rem] leading-tight text-navy-950 sm:text-5xl">Review and pay</h1>
          <p className="mt-3 flex items-center gap-2 text-ink-600">
            <Clock className="size-4 text-gold-600" aria-hidden /> Your room is held until {formatDateTime(b.hold_expires_at!)}.
          </p>
          <dl className="mt-8 divide-y divide-hairline rounded-card bg-ivory-50 text-sm shadow-card">
            {[["Booking reference", b.reference], ["Name", b.guest.full_name], ["Email", b.guest.email ?? ""], ["Phone", b.guest.phone ?? ""], ...(b.special_requests ? [["Special requests", b.special_requests]] : [])].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 px-5 py-4"><dt className="text-ink-500">{k}</dt><dd className="text-right break-all text-ink-900">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-ink-600">
            You&apos;ll pay securely with Paystack by card, bank transfer or USSD. Your booking is confirmed as soon as Paystack confirms your payment.
          </p>
          <PayButton token={token} total={formatNaira(b.total_amount_kobo)} />
          <p className="mt-3 text-sm text-ink-500">
            Prefer to pay another way? Call {hotel.phoneDisplay} and quote <span className="font-mono">{b.reference}</span>.
          </p>
        </div>
        <BookingSummary option={option} search={stay} className="hidden lg:block" />
      </div>
    </>
  );
}

export default function ReviewPage(props: PageProps<"/book/review/[token]">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-ivory-200" />}>
        <Review params={props.params} />
      </Suspense>
    </Container>
  );
}
