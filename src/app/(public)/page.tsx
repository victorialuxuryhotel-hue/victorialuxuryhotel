import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingBar } from "@/components/public/booking-bar";
import { PageSkeleton } from "@/components/public/page-skeleton";
import { Photo } from "@/components/public/photo";
import { PhotoSplit } from "@/components/public/photo-split";
import { RoomCard } from "@/components/public/room-card";
import { Container, Section, SectionHeading } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { sitePhoto } from "@/components/public/site-photo";
import { home, homeTiles, onSite } from "@/content/site";
import { getPublicCategories, getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = {
  title: { absolute: "Victoria Luxury Hotel and Apartment, Akure | Hotel in Alagbaka GRA" },
  alternates: { canonical: "/" },
};

/** Designs G1 (computer) and M1 (phone). */
async function HomePageContent() {
  const [categories, photos] = await Promise.all([getPublicCategories(), getSitePhotos()]);
  return (
    <>
      <section className="relative isolate flex min-h-[520px] items-end overflow-hidden bg-navy-950 lg:min-h-[620px]">
        <Photo photo={sitePhoto(photos, "hero", home.hero)} tone="dark" priority sizes="100vw" className="absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(1,18,72,.1),rgba(1,18,72,.8))] lg:bg-[linear-gradient(180deg,rgba(1,18,72,.15),rgba(1,18,72,.7))]" />
        <Container className="flex flex-col gap-3.5 pt-24 pb-[22px] lg:gap-[22px] lg:pb-16">
          <p className="text-xs font-semibold tracking-[0.14em] text-gold-200 uppercase lg:text-[13px] lg:tracking-[0.16em]">{home.eyebrow}</p>
          <h1 className="max-w-[760px] font-display text-[40px] leading-[1.05] font-semibold text-white lg:text-[68px] lg:leading-[1.02]">{home.title}</h1>
          <p className="hidden max-w-[640px] text-lg text-[#e8ecf8] lg:block">{home.intro}</p>
          <div className="lg:max-w-[880px]">
            <BookingBar />
          </div>
        </Container>
      </section>

      <Section>
        <div className="flex items-end justify-between gap-4">
          <SectionHeading eyebrow="Stay" title="Rooms, suites & apartments" className="max-lg:[&>p]:hidden" />
          <Link href="/rooms" className={buttonStyles({ variant: "secondary", className: "hidden lg:inline-flex" })}>All rooms</Link>
        </div>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:mt-7 lg:grid-cols-4 lg:gap-5">
          {categories.map((c) => (
            <li key={c.slug} className="flex"><RoomCard c={c} /></li>
          ))}
        </ul>
        <Link href="/rooms" className={buttonStyles({ variant: "secondary", className: "mx-auto mt-4 flex lg:hidden" })}>All rooms</Link>
      </Section>

      {/* The On site cards and their split photos were set by the client on 27 Nov. */}
      <Section tone="ivory">
        <SectionHeading title="Unwind without leaving the hotel" />
        <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:mt-7 lg:grid-cols-4">
          {onSite.map((h) => (
            <li key={h.slot} className="flex flex-col gap-3">
              <PhotoSplit photos={photos.all[h.slot] ?? []} fallback={{ alt: h.alt }} className="h-[220px] rounded-xl lg:h-[260px]" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" />
              <h3 className="font-display text-[26px] leading-tight font-semibold text-ink-900">{h.title}</h3>
              <p className="text-[15px] leading-normal text-muted">{h.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <SectionHeading title="Comfort, care and everything on site" intro="Book direct: pay securely online, get your confirmation straight away, and manage your stay from your email." />
            <Link href="/book" className={buttonStyles({ size: "lg", className: "mt-5" })}>Book your stay</Link>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {homeTiles.map((t) => (
              <li key={t.name} className="flex flex-col gap-1 rounded-xl border border-hairline p-[18px]">
                <b className="text-[15px]">{t.name}</b>
                <span className="text-[13px] text-muted">{t.text}</span>
              </li>
            ))}
          </ul>
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
