import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ArrowUpRight, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { MapEmbed, MapMotif } from "@/components/public/map-card";
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

async function HomePageContent() {
  const [categories, photos] = await Promise.all([getPublicCategories(), getSitePhotos()]);
  const experienceSlots = ["pool", "spa", "bar"];
  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-navy-950 text-ivory-50">
        <Photo photo={sitePhoto(photos, "hero", home.hero)} tone="dark" priority sizes="100vw" className="absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_0%,rgb(4_48_160/0.55),transparent_55%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent" />
        <Container className="pt-12 pb-16 sm:pt-32 sm:pb-44">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-300">{home.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl font-display text-[2.375rem] leading-[1.04] text-balance sm:mt-5 sm:text-7xl sm:leading-[1.02]">{home.title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ivory-200/80 sm:mt-6 sm:text-lg">{home.intro}</p>
          <div className="mt-9 hidden flex-wrap gap-3 sm:flex">
            <Link href="/rooms" className={buttonStyles({ variant: "accent", size: "lg", className: "border-gold-400 text-gold-200 hover:bg-gold-400/15" })}>
              Explore rooms
            </Link>
            <Link href="/facilities" className={buttonStyles({ variant: "secondary", size: "lg", className: "border-white/40 text-white hover:bg-ivory-50/12" })}>
              See facilities
            </Link>
          </div>
        </Container>
      </section>

      {/* Phones: the search sits below the hero (not over it). Larger screens: it floats over the hero's edge. */}
      <div className="border-b border-hairline bg-ivory-50 py-4 sm:border-0 sm:bg-transparent sm:py-0">
        <Container className="relative z-10 sm:-mt-12">
          <BookingBar />
        </Container>
      </div>

      {/* Accommodation */}
      <Section tone="ivory">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading eyebrow="Stay" title="Rooms, suites & apartments" />
          <Link href="/rooms" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-navy-800 hover:text-gold-600">
            <span>
              View all<span className="sm:hidden"> {categories.length}</span>
            </span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ScrollRail label="Room types" className="mt-8 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.slug} href={`/rooms/${c.slug}`} className="group">
              <div className="overflow-hidden rounded-card">
                <Photo photo={c.photos[0] ?? { alt: c.name }} className="aspect-[4/5] transition-transform duration-700 group-hover:scale-[1.04]" sizes="(min-width: 1024px) 25vw, 80vw" />
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl text-navy-950">{c.name}</h3>
                  {c.summary ? <p className="mt-1 text-sm leading-relaxed text-ink-600">{c.summary}</p> : null}
                  <p className="mt-2 text-sm text-ink-500">From {formatNaira(c.fromRateKobo)} / night</p>
                </div>
                <ArrowUpRight className="mt-1 size-5 shrink-0 text-ink-400 transition-colors group-hover:text-gold-600" aria-hidden />
              </div>
            </Link>
          ))}
        </ScrollRail>
      </Section>

      {/* On site: pool, spa and bar, then every facility in one line */}
      <Section tone="navy" className="py-14">
        <SectionHeading invert eyebrow="On site" title="Pool, spa & bar" />
        <ScrollRail label="On site" tone="dark" className="mt-8 sm:mt-12 sm:grid-cols-3">
          {highlights.map((h, i) => (
            <article key={h.title}>
              <Photo photo={sitePhoto(photos, experienceSlots[i]!, h)} tone="dark" className="aspect-[4/5] rounded-card ring-1 ring-white/10" sizes="(min-width: 640px) 33vw, 80vw" />
              <h3 className="mt-5 font-display text-2xl">{h.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ivory-200/70">{h.text}</p>
            </article>
          ))}
        </ScrollRail>
        <div className="mt-10 border-t border-white/15 pt-6">
          <p className="text-sm leading-relaxed text-ivory-200/80">{facilities.map((f) => f.name).join(" · ")}</p>
          <Link href="/facilities" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold-300 hover:text-gold-200">
            All facilities <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* Find us */}
      <Section className="py-10 sm:py-24">
        <div className="grid overflow-hidden rounded-card border border-hairline bg-ivory-50 lg:grid-cols-2 lg:border-0 lg:shadow-card">
          <div className="p-5 sm:p-8 lg:p-12">
            <SectionHeading eyebrow="Find us" title="Alagbaka GRA, Akure" />
            <p className="mt-4 hidden gap-3 text-ink-700 lg:flex">
              <MapPin className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />
              {hotel.address.line1}, {hotel.address.city}, {hotel.address.state}
            </p>
            <a href={hotel.mapsUrl} aria-label={`Open ${hotel.name} in Maps`} className="mt-5 block overflow-hidden rounded-md lg:hidden">
              <MapMotif className="h-[120px]" />
            </a>
            <div className="mt-5 grid grid-cols-3 gap-2 lg:mt-8 lg:max-w-md">
              <a href={hotel.mapsUrl} className={buttonStyles({ variant: "secondary", className: "h-11 gap-1.5 px-1 text-sm md:h-11 md:text-sm" })}>
                <Navigation className="hidden size-4 shrink-0 min-[360px]:block" aria-hidden /> Directions
              </a>
              <a href={`tel:${hotel.phone}`} className={buttonStyles({ variant: "secondary", className: "h-11 gap-1.5 px-1 text-sm md:h-11 md:text-sm" })}>
                <Phone className="hidden size-4 shrink-0 min-[360px]:block" aria-hidden /> Call
              </a>
              <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", className: "h-11 gap-1.5 px-1 text-sm md:h-11 md:text-sm" })}>
                <MessageCircle className="hidden size-4 shrink-0 min-[360px]:block" aria-hidden /> WhatsApp
              </a>
            </div>
          </div>
          <MapEmbed className="lg:h-full lg:min-h-96" />
        </div>
      </Section>
    </>
  );
}

/** Content reads room types and photos per request; the page frame shows immediately. */
export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}
