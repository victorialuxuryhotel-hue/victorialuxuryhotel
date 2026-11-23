import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingSummary, CompactSummary, Steps } from "@/components/booking/booking-ui";
import { GuestDetailsForm } from "@/components/booking/guest-details-form";
import { Container } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { createWebsiteBooking } from "@/server/booking";
import { publicBookingRules, publicExtras, searchStay, staySchema } from "@/server/queries/booking";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function StartAgain({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h1 className="font-display text-4xl text-navy-950">{message}</h1>
      <Link href="/book" className={buttonStyles({ className: "mt-8" })}>Search again</Link>
    </div>
  );
}

async function Details({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const slug = one(sp.category);
  const parsed = staySchema.safeParse({ checkIn: one(sp.checkIn), checkOut: one(sp.checkOut), guests: one(sp.guests) });
  if (!slug || !parsed.success) return <StartAgain message="Let's start with your dates" />;

  const [result, rules, extras] = await Promise.all([searchStay(parsed.data), publicBookingRules(), publicExtras()]);
  const option = result.ok ? result.options.find((o) => o.slug === slug) : undefined;
  if (!option || !option.isAvailable) return <StartAgain message="Sorry, that room is no longer available for your dates" />;

  return (
    <>
      <Steps current={2} />
      <div className="mt-5 grid gap-6 sm:mt-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <CompactSummary option={option} search={parsed.data} holdMinutes={rules.holdMinutes} />
        <GuestDetailsForm
          total={formatNaira(option.totalKobo)}
          action={createWebsiteBooking}
          hidden={{ category: slug, checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, guests: String(parsed.data.guests) }}
          cancellationPolicy={rules.cancellationPolicy}
          extras={extras}
          nights={option.nights}
        />
        <BookingSummary option={option} search={parsed.data} className="hidden lg:block">
          <p className="mt-4 text-xs text-ink-500">Your room is held for {rules.holdMinutes} minutes while you complete payment.</p>
        </BookingSummary>
      </div>
    </>
  );
}

export default function DetailsPage(props: PageProps<"/book/details">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-ivory-200" />}>
        <Details searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
