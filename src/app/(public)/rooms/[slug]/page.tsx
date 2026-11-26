import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { Photo } from "@/components/public/photo";
import { PhotoStrip } from "@/components/public/photo-strip";
import { RoomPriceBar } from "@/components/public/room-price-bar";
import { Container, Section } from "@/components/public/section";
import { hotel } from "@/config/hotel";
import { formatNaira } from "@/lib/format";
import { getPublicCategories, getPublicCategory } from "@/server/queries/catalogue";

const included = ["Free Wi-Fi", "24/7 power", "Access to the indoor pool", "On-site parking", "Laundry service", "Airport shuttle on request"];

export async function generateMetadata({ params }: PageProps<"/rooms/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const c = await getPublicCategory(slug).catch(() => null);
  const facts = c ? ` Sleeps ${c.maxOccupancy}, from ${formatNaira(c.fromRateKobo)} a night.` : "";
  return {
    title: `${c?.name ?? name} room`,
    description: `${c?.name ?? name} at ${hotel.name}, Alagbaka GRA, Akure.${facts} Book direct online.`,
    alternates: { canonical: `/rooms/${slug}` },
  };
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

  const amenities = [...new Set([...c.amenities, ...included])];

  return (
    <>
      <Container className="pt-6">
        <Link href="/rooms" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-500 hover:text-navy-800">
          <ArrowLeft className="size-4" aria-hidden /> All rooms
        </Link>
        <div className="mt-2">
          <PhotoStrip label={`Photos of ${c.name}`}>
            {(c.photos.length ? c.photos : [{ alt: c.name }]).map((p, i) => (
              <Photo key={i} photo={p} priority={i === 0} sizes="88vw" className="aspect-[4/3] rounded-card" />
            ))}
          </PhotoStrip>
        </div>
        <div className="hidden grid-cols-[2fr_1fr] grid-rows-2 gap-2.5 sm:grid">
          <Photo photo={cover ?? { alt: c.name }} priority sizes="66vw" className="row-span-2 aspect-[4/3] rounded-card" />
          {[0, 1].map((i) => (
            <Photo key={i} photo={rest[i] ?? { alt: `${c.name}, detail` }} sizes="33vw" className="h-full rounded-card" />
          ))}
        </div>
      </Container>

      <Section className="pt-6 pb-16 sm:pt-9 sm:pb-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl leading-[1.05] text-navy-950">{c.name}</h1>
            <p className="mt-2.5 text-sm text-ink-600">
              Sleeps up to {c.maxOccupancy} · from <span className="font-semibold text-navy-950 tabular-nums">{formatNaira(c.fromRateKobo)}</span> per night
            </p>
            {c.summary ? <p className="mt-6 text-lg leading-relaxed text-ink-700">{c.summary}</p> : null}
            {c.description ? <div className="mt-4 space-y-4 leading-relaxed whitespace-pre-line text-ink-600">{c.description}</div> : null}

            <section className="mt-9">
              <h2 className="font-display text-[1.625rem] text-navy-950">What&apos;s included</h2>
              <ul className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-2.5 text-sm">
                {amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2.5 text-ink-700"><Check className="size-4 shrink-0 text-gold-500" aria-hidden /> {a}</li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="lg:w-[380px] lg:shrink-0">
            <div id="availability" className="scroll-mt-24 rounded-card border border-hairline bg-white p-5 shadow-card lg:sticky lg:top-24">
              <p className="text-[13px] text-ink-500"><span className="text-[1.625rem] font-semibold text-navy-950 tabular-nums">{formatNaira(c.fromRateKobo)}</span> / night</p>
              <div className="mt-4"><BookingBar variant="stacked" nightlyKobo={c.fromRateKobo} /></div>
              <p className="mt-3 text-xs text-ink-500">Check availability to confirm your total. Instant confirmation once paid. Secure payment by Paystack.</p>
            </div>
          </aside>
        </div>
      </Section>

      {others.length ? (
        <Section tone="ivory" className="py-14 sm:py-14">
          <h2 className="font-display text-[2rem] font-medium text-navy-950">Other ways to stay</h2>
          <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/rooms/${o.slug}`} className="flex h-full items-center gap-3.5 rounded-card border border-hairline bg-white p-2.5 transition-shadow hover:shadow-lift">
                  <Photo photo={o.photos[0] ?? { alt: o.name }} sizes="72px" className="h-14 w-18 shrink-0 rounded-lg [&>span]:hidden" />
                  <span>
                    <span className="block font-display text-xl font-semibold text-navy-950">{o.name}</span>
                    <span className="block text-[13px] text-ink-500">from {formatNaira(o.fromRateKobo)}/night</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <RoomPriceBar price={formatNaira(c.fromRateKobo)} targetId="availability" />
    </>
  );
}
