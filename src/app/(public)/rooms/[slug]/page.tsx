import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Check, Users } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { CtaBand } from "@/components/public/cta-band";
import { Photo } from "@/components/public/photo";
import { Container, Eyebrow, Section } from "@/components/public/section";
import { hotel } from "@/config/hotel";
import { formatNaira } from "@/lib/format";
import { getPublicCategories, getPublicCategory } from "@/server/queries/catalogue";

const included = ["Free Wi-Fi", "24/7 power", "Access to the indoor pool", "On-site parking", "Laundry service", "Airport shuttle on request"];

export async function generateStaticParams() {
  return (await getPublicCategories()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/rooms/[slug]">): Promise<Metadata> {
  const c = await getPublicCategory((await params).slug);
  return c ? { title: c.name, description: c.summary || `${c.name} at ${hotel.name}, Akure.` } : {};
}

export default function RoomTypePage(props: PageProps<"/rooms/[slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-12">
          <div className="aspect-[16/7] animate-pulse rounded-card bg-ivory-200" />
          <div className="mt-10 h-10 w-64 animate-pulse rounded bg-ivory-200" />
        </Container>
      }
    >
      <RoomType params={props.params} />
    </Suspense>
  );
}

async function RoomType({ params }: { params: Promise<{ slug: string }> }) {
  const c = await getPublicCategory((await params).slug);
  if (!c) notFound();
  const others = (await getPublicCategories()).filter((o) => o.slug !== c.slug);
  const [cover, ...rest] = c.photos;

  return (
    <>
      {/* Gallery: one large photo plus up to four smaller ones. */}
      <Container className="pt-8 sm:pt-12">
        <Link href="/rooms" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-navy-800">
          <ArrowLeft className="size-4" aria-hidden /> All rooms
        </Link>
        <div className="mt-6 grid gap-3 sm:grid-cols-4 sm:grid-rows-2">
          <Photo photo={cover ?? { alt: c.name }} priority sizes="(min-width: 640px) 50vw, 100vw" className="aspect-[4/3] rounded-card sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:h-full" />
          {[0, 1, 2, 3].map((i) => (
            <Photo key={i} photo={rest[i] ?? { alt: `${c.name}, detail` }} sizes="25vw" className="hidden aspect-[4/3] rounded-card sm:block" />
          ))}
        </div>
      </Container>

      <Section className="pt-12 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-20">
          <div>
            <Eyebrow>Accommodation</Eyebrow>
            <h1 className="mt-4 font-display text-5xl text-navy-950 sm:text-6xl">{c.name}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-ink-600">
              <span className="flex items-center gap-2"><Users className="size-4 text-gold-600" aria-hidden /> Sleeps up to {c.maxOccupancy}</span>
              <span>From <span className="font-semibold text-navy-950">{formatNaira(c.fromRateKobo)}</span> per night</span>
            </p>
            {c.summary ? <p className="mt-8 text-xl leading-relaxed text-ink-700">{c.summary}</p> : null}
            {c.description ? <div className="mt-6 space-y-4 leading-relaxed whitespace-pre-line text-ink-600">{c.description}</div> : null}

            {c.amenities.length ? (
              <section className="mt-12">
                <h2 className="font-display text-3xl text-navy-950">In the room</h2>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {c.amenities.map((a) => <li key={a} className="flex items-center gap-3 text-ink-700"><Check className="size-4 text-gold-500" aria-hidden /> {a}</li>)}
                </ul>
              </section>
            ) : null}

            <section className="mt-12">
              <h2 className="font-display text-3xl text-navy-950">With every stay</h2>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {included.map((a) => <li key={a} className="flex items-center gap-3 text-ink-700"><Check className="size-4 text-gold-500" aria-hidden /> {a}</li>)}
              </ul>
            </section>
          </div>

          <aside className="lg:pt-10">
            <div className="rounded-card bg-white p-6 shadow-card lg:sticky lg:top-28">
              <p className="font-display text-2xl text-navy-950">Check availability</p>
              <p className="mt-1 text-sm text-ink-500">See the exact total for your dates. Instant confirmation once paid.</p>
              <div className="mt-5"><BookingBar variant="stacked" /></div>
            </div>
          </aside>
        </div>
      </Section>

      {others.length ? (
        <Section tone="ivory">
          <h2 className="font-display text-4xl text-navy-950">Other ways to stay</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o) => (
              <Link key={o.slug} href={`/rooms/${o.slug}`} className="group">
                <div className="overflow-hidden rounded-card">
                  <Photo photo={o.photos[0] ?? { alt: o.name }} sizes="(min-width: 1024px) 33vw, 50vw" className="aspect-[4/3] transition-transform duration-700 group-hover:scale-[1.04]" />
                </div>
                <h3 className="mt-4 font-display text-2xl text-navy-950">{o.name}</h3>
                <p className="text-sm text-ink-500">From {formatNaira(o.fromRateKobo)} per night</p>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <CtaBand />
    </>
  );
}
