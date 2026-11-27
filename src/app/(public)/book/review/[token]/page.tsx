import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { BookingSummary, Steps } from "@/components/booking/booking-ui";
import { HoldBanner } from "@/components/booking/hold-banner";
import { Container } from "@/components/public/section";
import { PayButton } from "@/components/booking/pay-button";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira } from "@/lib/format";
import { getBookingByToken, publicBookingRules } from "@/server/queries/booking";

export const metadata: Metadata = { title: "Review and pay", robots: { index: false, follow: false } };

async function Review({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getBookingByToken(token);
  if (!b) notFound();

  const option = {
    slug: b.category.slug, name: b.category.name, summary: b.category.short_description ?? "", maxOccupancy: b.category.max_occupancy,
    isAvailable: true, nightlyRateKobo: b.nightly_rate_kobo, totalKobo: b.due_kobo, nights: b.nights ?? 0, photo: b.photo,
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

  const rules = await publicBookingRules();
  const rows: Array<[string, string]> = [
    ["Room", b.category.name],
    ["Dates", `${formatDate(b.check_in, { year: false })} → ${formatDate(b.check_out, { year: false })}`],
    ["Nights", `${b.nights ?? 0} × ${formatNaira(b.nightly_rate_kobo)}`],
    ...b.extras.map((e) => [e.name, `${formatNaira(e.unit_price_kobo * (e.per_night ? (b.nights ?? 1) : 1))}${e.per_night ? ` (${formatNaira(e.unit_price_kobo)} a night)` : ""}`] as [string, string]),
    ...(b.discount_kobo ? [[`Promo ${b.promo_code ?? ""}`.trim(), `−${formatNaira(b.discount_kobo)}`] as [string, string]] : []),
    ["Guests", String(b.guest_count)],
    ["Guest", b.guest.full_name],
    ...(b.guest.email ? [["Confirmation to", b.guest.email] as [string, string]] : []),
  ];

  return (
    <>
      <Steps current={3} />
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_21rem] lg:gap-10">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] leading-tight text-navy-950">Review and pay</h1>
          <div className="mt-3.5">
            <HoldBanner category={b.category.name} expiresAt={b.hold_expires_at!} againHref={`/book?checkIn=${b.check_in}&checkOut=${b.check_out}&guests=${b.guest_count}`} />
          </div>
          <section aria-labelledby="summary" className="mt-5 overflow-hidden rounded-card border border-hairline bg-white">
            <h2 id="summary" className="border-b border-hairline px-[18px] py-3.5 font-sans text-sm">Booking details</h2>
            <dl className="divide-y divide-ivory-100 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-[18px] py-3">
                  <dt className="text-ink-500">{k}</dt>
                  {/* Words wrap whole ("Thu 26 Nov", "₦10,000"); only an email address may break anywhere. */}
                  <dd className={`text-right text-ink-900 tabular-nums ${k === "Confirmation to" ? "break-all" : "break-words"}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-baseline justify-between border-t border-hairline px-[18px] py-3.5 font-semibold text-navy-950 tabular-nums">
              <span>Total to pay</span>
              <span className="text-2xl">{formatNaira(b.due_kobo)}</span>
            </div>
          </section>
          {b.lateCancelNow ? (
            <p role="note" className="mt-4 rounded-xl border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm text-warning-700">
              Your arrival day is less than {rules.freeCancelHours} hours away, so this booking can&apos;t be cancelled for free: {rules.lateCancelFeePct}% of the room price is kept if you cancel.
            </p>
          ) : null}
          {rules.cancellationPolicy ? <p className="mt-4 text-sm leading-relaxed text-ink-600">{rules.cancellationPolicy}</p> : null}

          <PayButton token={token} total={formatNaira(b.due_kobo)} />
          <p className="mt-3 text-[13px] text-ink-600">Card, bank transfer or USSD via Paystack. We never see your card details.</p>
          <p className="mt-1.5 text-[13px] text-ink-500">
            Prefer another way? Call {hotel.phoneDisplay} and quote <span className="font-mono">{b.reference}</span>.
          </p>
        </div>
        <BookingSummary option={option} search={stay} className="hidden lg:block" />
      </div>
    </>
  );
}

export default function ReviewPage(props: PageProps<"/book/review/[token]">) {
  return (
    <Container className="max-w-[65rem] pt-7 pb-16">
      <Suspense fallback={<div className="skeleton h-96 !rounded-card" />}>
        <Review params={props.params} />
      </Suspense>
    </Container>
  );
}
