import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { StayAside, Steps } from "@/components/booking/booking-ui";
import { HoldBanner } from "@/components/booking/hold-banner";
import { Container } from "@/components/public/section";
import { PayButton } from "@/components/booking/pay-button";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { checkInWhen, checkOutWhen } from "@/lib/stay-times";
import { getBookingByToken, publicBookingRules } from "@/server/queries/booking";

export const metadata: Metadata = { title: "Check and pay", robots: { index: false, follow: false } };

/** Booking step 3, check and pay (designs G6, M7). */
async function Review({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getBookingByToken(token);
  if (!b) notFound();

  if (b.status === "confirmed") redirect(`/book/confirmation/${token}`);
  if (!b.holdActive) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="font-display text-[34px] leading-tight font-semibold text-ink-900">This booking hold has ended</h1>
        <p className="mt-3 text-muted">Payment wasn&apos;t completed in time, so the room was released. You&apos;re welcome to search again.</p>
        <Link href="/book" className={buttonStyles({ className: "mx-auto mt-8 flex" })}>Search again</Link>
      </div>
    );
  }

  const rules = await publicBookingRules();
  const nights = b.nights ?? 0;
  const roomLine = `${b.category.name} · ${plural(b.guest_count, "guest")}`;
  const details: Array<[string, string]> = [
    ["Guest", b.guest.full_name],
    ...(b.guest.phone ? [["Phone", b.guest.phone] as [string, string]] : []),
    ...(b.guest.email ? [["Email", b.guest.email] as [string, string]] : []),
    ["Arrive", `${formatDate(b.check_in, { year: false })} · ${checkInWhen(rules.checkInTime)}`],
    ["Leave", `${formatDate(b.check_out, { year: false })} · ${checkOutWhen(rules.checkOutTime)}`],
    ["Room", roomLine],
  ];
  const lines: Array<[string, string]> = [
    [`${b.category.name} · ${plural(nights, "night")}`, formatNaira(b.nightly_rate_kobo * nights)],
    ...b.extras.map((e) => [e.name, formatNaira(e.unit_price_kobo * (e.per_night ? nights || 1 : 1))] as [string, string]),
    ...(b.discount_kobo ? [[`Promo ${b.promo_code ?? ""}`.trim(), `−${formatNaira(b.discount_kobo)}`] as [string, string]] : []),
  ];
  const total = formatNaira(b.due_kobo);

  return (
    <>
      <Steps current={2} />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-[18px]">
          <h1 className="font-display text-[32px] leading-tight font-semibold text-ink-900 lg:text-[40px]">Check and pay</h1>
          <HoldBanner category={b.category.name} expiresAt={b.hold_expires_at!} againHref={`/book?checkIn=${b.check_in}&checkOut=${b.check_out}&guests=${b.guest_count}`} />

          {/* Computer: who and when in three columns. Phone: one list with the prices and the total (M7). */}
          <dl className="hidden grid-cols-3 gap-x-6 gap-y-4 rounded-xl border border-hairline p-5 lg:grid">
            {details.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs font-semibold text-muted">{k}</dt>
                <dd className={`mt-1 text-[15px] font-semibold tabular-nums ${k === "Email" ? "break-all" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl border border-hairline p-4 lg:hidden">
            <dl className="flex flex-col gap-2.5 text-sm tabular-nums">
              {[...details.filter(([k]) => k !== "Phone" && k !== "Email"), ...lines].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
                <dt className="text-[15px]">Total</dt>
                <dd className="text-2xl font-bold">{total}</dd>
              </div>
            </dl>
          </div>

          {b.lateCancelNow ? (
            <p role="note" className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#8a4b06]">
              Your arrival day is less than {rules.freeCancelHours} hours away, so this booking can&apos;t be cancelled for free: {rules.lateCancelFeePct}% of the room price is kept if you cancel.
            </p>
          ) : null}
          {rules.cancellationPolicy ? (
            <p className="rounded-xl bg-[#e8eefb] px-4 py-3 text-sm leading-relaxed text-navy-900"><b>Cancellation: </b>{rules.cancellationPolicy}</p>
          ) : null}
          <p className="text-[13px] text-muted">
            You&apos;ll pay securely with Paystack: card, bank transfer or USSD. We hold your room for {rules.holdMinutes} minutes while you pay.
          </p>
          <p className="text-[13px] text-muted">
            Prefer another way? Call <a href={`tel:${hotel.phone}`} className="text-navy-700 underline-offset-2 hover:underline">{hotel.phoneDisplay}</a> and quote <b className="text-ink-900">{b.reference}</b>.
          </p>
          <PayButton token={token} total={total} part="phone" />
        </div>
        <StayAside className="hidden lg:flex" rows={lines} totalKobo={b.due_kobo}>
          <PayButton token={token} total={total} />
        </StayAside>
      </div>
    </>
  );
}

export default function ReviewPage(props: PageProps<"/book/review/[token]">) {
  return (
    <Container className="flex flex-col gap-[22px] pt-4 pb-10 lg:pt-8 lg:pb-16">
      <Suspense fallback={<div className="skeleton h-96 !rounded-xl" />}>
        <Review params={props.params} />
      </Suspense>
    </Container>
  );
}
