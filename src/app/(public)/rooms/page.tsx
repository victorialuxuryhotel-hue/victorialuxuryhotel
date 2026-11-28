import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BookingBar } from "@/components/public/booking-bar";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { Photo } from "@/components/public/photo";
import { Container, Eyebrow } from "@/components/public/section";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { getPublicCategories } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "Rooms & apartments",
  description: "Rooms, suites and apartments at Victoria Luxury Hotel, Alagbaka GRA, Akure.",
  alternates: { canonical: "/rooms" },
};

/** Designs G2 (computer) and M4 (phone). */
async function RoomsPageContent() {
  const categories = await getPublicCategories();
  return (
    <Container className="flex flex-col gap-4 pt-4 pb-10 lg:gap-[22px] lg:pt-12 lg:pb-18">
      <div>
        <Eyebrow>Stay</Eyebrow>
        <h1 className="mt-1.5 font-display text-[34px] leading-[1.1] font-semibold text-ink-900 lg:text-[52px]">Rooms, suites &amp; apartments</h1>
      </div>
      <div className="lg:max-w-[880px]">
        <BookingBar collapsible />
      </div>
      <ul className="flex flex-col gap-3 lg:gap-4">
        {categories.map((c) => {
          const chips = [`Sleeps ${c.maxOccupancy}`, ...c.amenities.slice(0, 3)];
          return (
            <li key={c.slug} id={c.slug} className="grid scroll-mt-24 items-center overflow-hidden rounded-[14px] border border-hairline bg-white lg:grid-cols-[420px_1fr_240px] lg:gap-7 lg:p-5">
              <Link href={`/rooms/${c.slug}`} tabIndex={-1} aria-hidden>
                <Photo photo={c.photos[0] ?? { alt: c.name }} className="h-[190px] lg:h-[250px] lg:rounded-xl" sizes="(min-width: 1024px) 420px, 100vw" />
              </Link>
              <div className="flex flex-col gap-2 px-3.5 pt-3.5 lg:gap-2.5 lg:p-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-[26px] leading-tight font-semibold text-ink-900 lg:text-[34px]">{c.name}</h2>
                  <span className="shrink-0 tabular-nums lg:hidden">
                    <b className="text-[17px]">{formatNaira(c.fromRateKobo)}</b>
                    <span className="text-xs text-muted"> /night</span>
                  </span>
                </div>
                {c.summary ? <p className="text-sm leading-normal text-muted lg:text-[15px] lg:leading-relaxed">{c.summary}</p> : null}
                <ul className="flex flex-wrap gap-1.5 lg:gap-2" aria-label="Includes">
                  {chips.map((x) => (
                    <li key={x}><Badge>{x}</Badge></li>
                  ))}
                </ul>
              </div>
              <div className="px-3.5 pt-2 pb-3.5 lg:hidden">
                <Link href={`/rooms/${c.slug}`} className={buttonStyles({ variant: "secondary", className: "w-full" })}>
                  View room<span className="sr-only">: {c.name}</span>
                </Link>
              </div>
              <div className="hidden flex-col gap-2.5 border-l border-hairline pl-6 lg:flex">
                <p className="flex flex-col gap-2.5 tabular-nums">
                  <span className="text-[13px] text-muted">From</span>
                  <span className="text-[28px] leading-none font-bold">{formatNaira(c.fromRateKobo)}</span>
                  <span className="text-[13px] text-muted">per night</span>
                </p>
                <Link href={`/book?${new URLSearchParams({ room: c.slug })}`} className={buttonStyles({ className: "w-full" })}>
                  Choose dates<span className="sr-only"> for {c.name}</span>
                </Link>
                <Link href={`/rooms/${c.slug}`} className={buttonStyles({ variant: "ghost", size: "sm", className: "self-center" })}>
                  View room<span className="sr-only">: {c.name}</span>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}

export default function RoomsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoomsPageContent />
    </Suspense>
  );
}
