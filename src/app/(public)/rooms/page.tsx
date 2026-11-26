import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { Photo } from "@/components/public/photo";
import { Container, Eyebrow } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { getPublicCategories } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "Rooms & apartments",
  description: "Rooms, suites and apartments at Victoria Luxury Hotel, Alagbaka GRA, Akure.",
  alternates: { canonical: "/rooms" },
};

const included = ["Free Wi-Fi", "24/7 power", "Indoor pool", "On-site parking"];

async function RoomsPageContent() {
  const categories = await getPublicCategories();
  return (
    <>
      <section className="border-b border-hairline bg-ivory-100">
        <Container className="pt-8 pb-8 sm:pt-11">
          <Eyebrow>Accommodation</Eyebrow>
          <h1 className="mt-3 font-display text-[2rem] leading-[1.1] text-navy-950">Rooms, suites &amp; apartments</h1>
          <p className="mt-2.5 max-w-[35rem] text-[15px] leading-relaxed text-ink-600">
            Choose the space that suits your stay. Check your dates for live availability and the exact total.
          </p>
          <div className="mt-5 overflow-hidden rounded-card shadow-float"><BookingBar variant="inline" /></div>
        </Container>
      </section>

      <Container className="pt-10 pb-18">
        <p className="text-[13px] text-ink-600">
          <span className="font-semibold text-ink-900">Every stay includes</span> · {included.join(" · ")}
        </p>
        <ul className="mt-6 space-y-3">
          {categories.map((c) => (
            <li key={c.slug} id={c.slug} className="flex scroll-mt-24 flex-col overflow-hidden rounded-card border border-hairline bg-white transition-shadow hover:shadow-lift sm:flex-row">
              <Link href={`/rooms/${c.slug}`} tabIndex={-1} aria-hidden className="block sm:w-56 sm:shrink-0">
                <Photo photo={c.photos[0] ?? { alt: c.name }} className="aspect-video sm:aspect-auto sm:h-full sm:min-h-[150px]" sizes="(min-width: 640px) 14rem, 100vw" />
              </Link>
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3.5 px-5 py-[18px]">
                <div className="min-w-0 flex-[1_1_15rem]">
                  <h2 className="font-sans text-[19px] text-navy-950">{c.name}</h2>
                  {c.summary ? <p className="mt-1 text-sm leading-normal text-ink-600">{c.summary}</p> : null}
                  <p className="mt-1.5 text-[13px] text-ink-500">
                    {[`Sleeps up to ${c.maxOccupancy}`, ...c.amenities.slice(0, 3)].join(" · ")}
                  </p>
                  <Link href={`/rooms/${c.slug}`} className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-navy-800 hover:text-gold-600">
                    Photos &amp; details <span className="sr-only">of {c.name}</span> <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
                <div className="flex w-full items-end justify-between gap-4 sm:w-auto sm:flex-col sm:gap-2.5">
                  <p className="leading-tight sm:text-right">
                    <span className="block text-xs text-ink-500">from</span>
                    <span className="block text-2xl font-semibold text-navy-950 tabular-nums">{formatNaira(c.fromRateKobo)}</span>
                    <span className="block text-xs text-ink-500">per night</span>
                  </p>
                  <Link href="/book" className={buttonStyles({ className: "px-5 whitespace-nowrap" })}>Check dates</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}

export default function RoomsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoomsPageContent />
    </Suspense>
  );
}
