import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { MapCard } from "@/components/public/map-card";
import { ScrollRail } from "@/components/public/scroll-rail";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { Photo } from "@/components/public/photo";
import { Container, Section, SectionHeading } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { sitePhoto } from "@/components/public/site-photo";
import { facilities, highlights, home } from "@/content/site";
import { formatNaira } from "@/lib/format";
import { getPublicCategories, getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: { absolute: "Victoria Luxury Hotel and Apartment, Akure | Hotel in Alagbaka GRA" },
  alternates: { canonical: "/" },
};

async function HomePageContent() {
  const [categories, photos] = await Promise.all([getPublicCategories(), getSitePhotos()]);
  const experienceSlots = ["pool", "spa", "bar"];
  return (
    <>
      <section className="relative isolate overflow-hidden bg-navy-950 text-ivory-50">
        <Photo photo={sitePhoto(photos, "hero", home.hero)} tone="dark" priority sizes="100vw" className="absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_0%,rgb(4_48_160/0.55),transparent_55%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent" />
        <Container className="pt-14 pb-16 sm:pt-24 sm:pb-32">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-300">{home.eyebrow}</p>
          <h1 className="mt-[18px] max-w-3xl font-display text-[2.5rem] leading-[1.04] font-medium sm:text-[4rem]">{home.title}</h1>
          <p className="mt-[18px] max-w-[34rem] leading-relaxed text-ivory-200/85">
            <span className="sm:hidden">{home.facts}</span>
            <span className="hidden sm:inline">{home.intro}</span>
          </p>
          <div className="mt-7 hidden flex-wrap gap-3 sm:flex">
            <Link href="/rooms" className={buttonStyles({ variant: "accent", size: "lg", className: "h-12" })}>
              Explore rooms
            </Link>
            <Link href="/facilities" className={buttonStyles({ variant: "secondary", size: "lg", className: "h-12 border-white/25 bg-white/5 text-white hover:bg-white/15" })}>
              See facilities
            </Link>
          </div>
        </Container>
      </section>

      <div className="border-b border-hairline py-4 sm:border-0 sm:py-0">
        <Container className="relative z-10 sm:-mt-12">
          <BookingBar />
        </Container>
      </div>

      <Section className="py-12 sm:py-18">
        <div className="flex items-end justify-between gap-4">
          <SectionHeading eyebrow="Stay" title="Rooms, suites & apartments" />
          <Link href="/rooms" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-navy-800 hover:text-gold-600">
            View all <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ScrollRail label="Room types" className="mt-8 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.slug} href={`/rooms/${c.slug}`} className="group">
              <div className="overflow-hidden rounded-card">
                <Photo photo={c.photos[0] ?? { alt: c.name }} className="aspect-[4/3] transition-transform duration-700 group-hover:scale-[1.04]" sizes="(min-width: 1024px) 25vw, 80vw" />
              </div>
              <h3 className="mt-3.5 font-display text-2xl text-navy-950">{c.name}</h3>
              <p className="mt-1 text-sm text-ink-600">
                Sleeps {c.maxOccupancy} · from <span className="font-semibold text-navy-950 tabular-nums">{formatNaira(c.fromRateKobo)}</span>/night
              </p>
            </Link>
          ))}
        </ScrollRail>
      </Section>

      <Section tone="navy" className="py-12 sm:py-18">
        <SectionHeading invert eyebrow="On site" title="Unwind without leaving the hotel" />
        <ScrollRail label="On site" tone="dark" className="mt-8 sm:grid-cols-3 sm:gap-5">
          {highlights.map((h, i) => (
            <article key={h.title}>
              <Photo photo={sitePhoto(photos, experienceSlots[i]!, h)} tone="dark" className="aspect-[3/2] rounded-card ring-1 ring-white/10" sizes="(min-width: 640px) 33vw, 80vw" />
              <h3 className="mt-4 font-display text-2xl font-medium">{h.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ivory-200/75">{h.text}</p>
            </article>
          ))}
        </ScrollRail>
        <div className="mt-10 border-t border-white/10 pt-7">
          <ul className="flex flex-wrap gap-2">
            {facilities.map((f) => (
              <li key={f.name} className="rounded-full border border-white/20 px-3.5 py-1.5 text-[13px] text-ivory-200">{f.name}</li>
            ))}
          </ul>
          <Link href="/facilities" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold-300 hover:text-gold-200">
            All facilities <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Section>

      <Section className="py-12 sm:py-18">
        <div className="grid overflow-hidden rounded-card bg-white shadow-card lg:grid-cols-2">
          <div className="p-6 sm:p-11">
            <SectionHeading eyebrow="Location" title="Alagbaka GRA, Akure" />
            <p className="mt-4 text-[15px] text-ink-700">
              {hotel.address.line1}, {hotel.address.city}, {hotel.address.state}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <a href={hotel.mapsUrl} className={buttonStyles()}>Get directions</a>
              <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary" })}>WhatsApp us</a>
              <a href={`tel:${hotel.phone}`} className={buttonStyles({ variant: "secondary", className: "sm:hidden" })}>Call</a>
            </div>
          </div>
          <div className="px-4 pb-4 sm:px-11 sm:pb-11 lg:contents">
            <MapCard embedClassName="lg:h-full lg:min-h-80" />
          </div>
        </div>
      </Section>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}
