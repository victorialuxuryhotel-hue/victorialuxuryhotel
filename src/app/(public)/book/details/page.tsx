import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Steps } from "@/components/booking/booking-ui";
import { DetailsStep } from "@/components/booking/details-step";
import { Container } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { createWebsiteBooking } from "@/server/booking";
import { publicBookingRules, publicExtras, searchStay, staySchema } from "@/server/queries/booking";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function StartAgain({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h1 className="font-display text-[34px] leading-tight font-semibold text-ink-900">{message}</h1>
      <Link href="/book" className={buttonStyles({ className: "mx-auto mt-8 flex" })}>Search again</Link>
    </div>
  );
}

/** Booking step 2 (designs G5, M2). */
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
      <Steps current={1} />
      <DetailsStep
        option={option}
        search={parsed.data}
        extras={extras}
        action={createWebsiteBooking}
        hidden={{ category: slug, checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, guests: String(parsed.data.guests) }}
        cancellationPolicy={rules.cancellationPolicy}
        backHref={`/book?${new URLSearchParams({ checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, guests: String(parsed.data.guests), room: slug })}`}
        sidebarNote={<p className="text-center text-xs text-muted">Your room is held for {rules.holdMinutes} minutes while you complete payment.</p>}
      />
    </>
  );
}

export default function DetailsPage(props: PageProps<"/book/details">) {
  return (
    <Container className="flex flex-col gap-[22px] pt-4 pb-10 lg:pt-8 lg:pb-16">
      <Suspense fallback={<div className="skeleton h-96 !rounded-xl" />}>
        <Details searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
