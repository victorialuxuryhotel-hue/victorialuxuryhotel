import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Check, Users } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { CtaBand } from "@/components/public/cta-band";
import { PageHero } from "@/components/public/page-hero";
import { Photo } from "@/components/public/photo";
import { Container, Eyebrow } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { getPublicCategories } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: "Rooms & apartments",
  description: "Rooms, suites and apartments at Victoria Luxury Hotel, Alagbaka GRA, Akure.",
};

// Shared by every room type; all are facilities the hotel offers.
const included = ["Free Wi-Fi", "24/7 power", "Access to the indoor pool", "On-site parking"];

async function RoomsPageContent() {
  const categories = await getPublicCategories();
  return (
    <>
      <PageHero eyebrow="Accommodation" title="Rooms, suites & apartments" intro="Choose the space that suits your stay. Check your dates for live availability and the exact total." />

      <Container className="relative z-10 -mt-8"><BookingBar /></Container>

      <div className="py-16 sm:py-24">
        <Container className="space-y-20 sm:space-y-28">
          {categories.map((c, i) => (
            <article key={c.slug} id={c.slug} className="grid scroll-mt-28 items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Link href={`/rooms/${c.slug}`} className={`group block overflow-hidden rounded-card ${i % 2 ? "lg:order-2" : ""}`}>
                <Photo photo={c.photos[0] ?? { alt: c.name }} className="aspect-[4/3] transition-transform duration-700 group-hover:scale-[1.03]" />
              </Link>
              <div>
                <Eyebrow>{`0${i + 1} · Accommodation`}</Eyebrow>
                <h2 className="mt-4 font-display text-5xl text-navy-950">{c.name}</h2>
                {c.summary ? <p className="mt-4 text-lg leading-relaxed text-ink-600">{c.summary}</p> : null}
                <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-600">
                  <span className="flex items-center gap-2"><Users className="size-4 text-gold-600" aria-hidden /> Sleeps up to {c.maxOccupancy}</span>
                  <span>From <span className="font-semibold text-navy-950">{formatNaira(c.fromRateKobo)}</span> per night</span>
                </p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {(c.amenities.length ? c.amenities.slice(0, 6) : included).map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-ink-700"><Check className="size-4 text-gold-500" aria-hidden /> {item}</li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link href={`/rooms/${c.slug}`} className={buttonStyles({ size: "lg" })}>View {c.name}</Link>
                  <Link href="/book" className="inline-flex items-center gap-2 text-sm font-semibold text-navy-800 hover:text-gold-600">
                    Check availability <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </Container>
      </div>

      <CtaBand title="Found the right room?" />
    </>
  );
}

/** Content reads room types and photos per request; the page frame shows immediately. */
export default function RoomsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoomsPageContent />
    </Suspense>
  );
}
