import Link from "next/link";
import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { CtaBand } from "@/components/public/cta-band";
import { Photo } from "@/components/public/photo";
import { Container, Section, SectionHeading } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { sitePhoto } from "@/components/public/site-photo";
import { facilities, guestTypes, highlights, home } from "@/content/site";
import { formatNaira } from "@/lib/format";
import { getPublicCategories, getSitePhotos } from "@/server/queries/catalogue";

/** Horizontal swipe on phones, grid from `sm` up: keeps mobile pages short. */
const rail = "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0";
const railItem = "w-[78%] shrink-0 snap-start sm:w-auto";

export default async function HomePage() {
  const [categories, photos] = await Promise.all([getPublicCategories(), getSitePhotos()]);
  const experienceSlots = ["pool", "spa", "bar"];
  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-navy-950 text-ivory-50">
        <Photo photo={sitePhoto(photos, "hero", home.hero)} tone="dark" priority sizes="100vw" className="absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_0%,rgb(4_48_160/0.55),transparent_55%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent" />
        <Container className="pt-20 pb-32 sm:pt-32 sm:pb-44">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-300">{home.eyebrow}</p>
          <h1 className="mt-5 max-w-3xl font-display text-[2.75rem] leading-[1.02] sm:text-7xl">{home.title}</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ivory-200/80 sm:text-lg">{home.intro}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/rooms" className={buttonStyles({ variant: "accent", size: "lg" })}>
              Explore rooms
            </Link>
            <Link href="/facilities" className={buttonStyles({ variant: "secondary", size: "lg", className: "border-white/25 bg-white/5 text-white hover:bg-white/15" })}>
              See facilities
            </Link>
          </div>
        </Container>
      </section>

      <Container className="relative z-10 -mt-16 sm:-mt-12">
        <BookingBar />
      </Container>

      {/* Welcome */}
      <Section className="pt-20 sm:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div className="relative">
            <Photo photo={sitePhoto(photos, "welcome", { alt: "Hotel interior" })} className="aspect-[4/3] rounded-card sm:aspect-[4/5]" />
            <div className="absolute -bottom-6 left-6 max-w-56 rounded-card bg-white px-6 py-5 shadow-card sm:left-auto sm:-right-6">
              <p className="font-display text-2xl leading-tight text-navy-900">Kings & queens</p>
              <p className="mt-1 text-sm text-ink-600">That&apos;s how we treat every guest.</p>
            </div>
          </div>
          <div className="pt-6 lg:pt-0">
            <SectionHeading
              eyebrow="Welcome"
              title="Rest, recharge and feel looked after"
              intro="Whether you're here for a meeting, a weekend or a month, everything you need is under one roof, with a team that takes care of the details."
            />
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-ivory-200 pt-8">
              {[
                ["Indoor pool", "Exclusive to guests"],
                ["In-house spa", "Heated room & body scrub"],
                ["Lounge & bar", "Relaxed evenings"],
                ["24/7 power", "Plus free Wi-Fi"],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="font-medium text-navy-950">{t}</dt>
                  <dd className="mt-1 text-sm text-ink-500">{d}</dd>
                </div>
              ))}
            </dl>
            <Link href="/about" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-navy-800 hover:text-gold-600">
              About the hotel <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </Section>

      {/* Accommodation */}
      <Section tone="ivory">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading eyebrow="Stay" title="Rooms, suites & apartments" />
          <Link href="/rooms" className="hidden shrink-0 items-center gap-2 text-sm font-semibold text-navy-800 hover:text-gold-600 sm:inline-flex">
            View all <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className={`mt-10 sm:grid-cols-2 lg:grid-cols-4 ${rail}`}>
          {categories.map((c) => (
            <Link key={c.slug} href={`/rooms/${c.slug}`} className={`group ${railItem}`}>
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
        </div>
      </Section>

      {/* Experiences */}
      <Section tone="navy">
        <SectionHeading invert eyebrow="Experiences" title="Unwind without leaving the hotel" />
        <div className={`mt-12 sm:grid-cols-3 ${rail}`}>
          {highlights.map((h, i) => (
            <article key={h.title} className={railItem}>
              <Photo photo={sitePhoto(photos, experienceSlots[i]!, h)} tone="dark" className="aspect-[4/5] rounded-card ring-1 ring-white/10" sizes="(min-width: 640px) 33vw, 80vw" />
              <h.icon className="mt-6 size-6 text-gold-400" strokeWidth={1.5} aria-hidden />
              <h3 className="mt-3 font-display text-2xl">{h.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory-200/70">{h.text}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* Facilities */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <SectionHeading eyebrow="Facilities" title="Everything on site" intro="From the first coffee to the last drink at the bar, you never need to leave." />
            <Link href="/facilities" className={buttonStyles({ variant: "secondary", className: "mt-8" })}>
              All facilities
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {facilities.map((f) => (
              <li key={f.name} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ivory-100">
                  <f.icon className="size-5 text-gold-600" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="text-sm font-medium text-navy-950">{f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Who we host */}
      <Section tone="ivory">
        <SectionHeading eyebrow="Your stay" title="However you travel" />
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {guestTypes.map((g) => (
            <div key={g.title} className="border-t border-ink-300/60 pt-5">
              <h3 className="font-display text-2xl text-navy-950">{g.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{g.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Location */}
      <Section>
        <div className="grid overflow-hidden rounded-card bg-white shadow-card lg:grid-cols-2">
          <div className="p-8 sm:p-12">
            <SectionHeading eyebrow="Location" title="Alagbaka GRA, Akure" />
            <p className="mt-6 flex gap-3 text-ink-700">
              <MapPin className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />
              {hotel.address.line1}, {hotel.address.city}, {hotel.address.state}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={hotel.mapsUrl} className={buttonStyles()}>Get directions</a>
              <Link href="/contact" className={buttonStyles({ variant: "secondary" })}>Contact us</Link>
            </div>
          </div>
          <iframe
            title={`Map showing ${hotel.name}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(`${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`)}&output=embed`}
            className="h-72 w-full border-0 lg:h-full lg:min-h-96"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
