import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <Link href={`/book?${new URLSearchParams({ checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, guests: String(parsed.data.guests) })}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-500 hover:text-navy-800">
        <ArrowLeft className="size-4" aria-hidden /> Change room
      </Link>
      <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_21rem] lg:gap-10">
        <DetailsStep
          option={option}
          search={parsed.data}
          holdMinutes={rules.holdMinutes}
          extras={extras}
          action={createWebsiteBooking}
          hidden={{ category: slug, checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, guests: String(parsed.data.guests) }}
          cancellationPolicy={rules.cancellationPolicy}
          sidebarNote={<p className="mt-4 text-xs text-ink-500">Your room is held for {rules.holdMinutes} minutes while you complete payment.</p>}
        />
      </div>
    </>
  );
}

export default function DetailsPage(props: PageProps<"/book/details">) {
  return (
    <Container className="max-w-[65rem] pt-7 pb-16">
      <Suspense fallback={<div className="skeleton h-96 !rounded-card" />}>
        <Details searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
