import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { Photo } from "@/components/public/photo";
import { PhotoStrip } from "@/components/public/photo-strip";
import { RoomPriceBar } from "@/components/public/room-price-bar";
import { Container } from "@/components/public/section";
import { Badge } from "@/components/ui/badge";
import { hotel } from "@/config/hotel";
import { formatNaira } from "@/lib/format";
import { getPublicCategory } from "@/server/queries/catalogue";
import { publicBookingRules } from "@/server/queries/booking";

const included = ["Free Wi-Fi", "24/7 power", "Access to the indoor pool", "On-site parking", "Laundry service", "Airport shuttle on request"];

export async function generateMetadata({ params }: PageProps<"/rooms/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await getPublicCategory(slug).catch(() => null);
  // Unknown room: say so in the tab and keep it out of search results.
  if (!c) return { title: "Page not found", robots: { index: false, follow: false } };
  return {
    title: `${c.name} room`,
    description: `${c.name} at ${hotel.name}, Alagbaka GRA, Akure. Sleeps ${c.maxOccupancy}, from ${formatNaira(c.fromRateKobo)} a night. Book direct online.`,
    alternates: { canonical: `/rooms/${slug}` },
  };
}

export default function RoomTypePage(props: PageProps<"/rooms/[slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-8">
          <div className="h-60 animate-pulse rounded-xl bg-ivory-200 lg:h-[440px]" />
          <div className="mt-8 h-10 w-64 animate-pulse rounded bg-ivory-200" />
        </Container>
      }
    >
      <RoomType params={props.params} />
    </Suspense>
  );
}

/** Designs G3 (computer), M5 (phone), D4 and D5 (the guests picker). */
async function RoomType({ params }: { params: Promise<{ slug: string }> }) {
  const c = await getPublicCategory((await params).slug);
  if (!c) notFound();
  const rules = await publicBookingRules().catch(() => null);
  const [cover, ...rest] = c.photos;
  const amenities = [...new Set([...c.amenities, ...included])];
  const chips = [`Sleeps ${c.maxOccupancy}`, ...c.amenities.slice(0, 2)];
  const freeCancel = rules ? `Free cancellation up to ${rules.freeCancelHours} hours before arrival.` : null;

  return (
    <>
      <PhotoStrip
        label={`Photos of ${c.name}`}
        overlay={
          <Link href="/rooms" aria-label="All rooms" className="absolute top-3 left-3 flex size-11 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-sm">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        }
      >
        {(c.photos.length ? c.photos : [{ alt: c.name }]).map((p, i) => (
          <Photo key={i} photo={p} priority={i === 0} sizes="100vw" className="h-60" />
        ))}
      </PhotoStrip>

      <Container className="flex flex-col gap-6 pt-5 pb-10 lg:pt-8 lg:pb-18">
        <Link href="/rooms" className="hidden min-h-11 w-fit items-center gap-1.5 text-sm text-navy-700 hover:underline lg:inline-flex">
          <ArrowLeft className="size-4" aria-hidden /> All rooms
        </Link>
        {/* The cover, and up to 2 more beside it (only photos the room type has). */}
        <div className={`hidden h-[440px] gap-3 lg:grid ${rest.length ? "grid-cols-[2fr_1fr]" : ""}`}>
          <Photo photo={cover ?? { alt: c.name }} priority sizes="66vw" className="h-full rounded-xl" />
          {rest.length ? (
            <div className="grid gap-3" style={{ gridTemplateRows: `repeat(${Math.min(rest.length, 2)}, minmax(0, 1fr))` }}>
              {rest.slice(0, 2).map((p, i) => (
                <Photo key={i} photo={p} sizes="33vw" className="h-full rounded-xl" />
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[1fr_400px] lg:gap-12">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-[18px]">
            <h1 className="font-display text-[40px] leading-[1.05] font-semibold text-ink-900 lg:text-[52px]">{c.name}</h1>
            <ul className="flex flex-wrap gap-2" aria-label="At a glance">
              {chips.map((x) => <li key={x}><Badge>{x}</Badge></li>)}
            </ul>
            {c.summary ? <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">{c.summary}</p> : null}
            {c.description ? <div className="max-w-[640px] space-y-4 text-[15px] leading-relaxed whitespace-pre-line text-muted">{c.description}</div> : null}
            <section className="mt-2">
              <h2 className="font-sans text-lg font-bold text-ink-900">In the room</h2>
              <ul className="mt-3 grid list-disc grid-cols-2 gap-x-6 gap-y-2 pl-5 text-sm text-ink-900 lg:max-w-[640px]">
                {amenities.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </section>
            {freeCancel ? <p className="rounded-xl bg-ivory-100 px-3.5 py-2.5 text-sm text-muted lg:hidden">{freeCancel}</p> : null}
          </div>

          <aside id="availability" className="scroll-mt-24 rounded-2xl border border-hairline bg-white p-4 shadow-[0_10px_30px_rgba(11,31,92,0.08)] lg:sticky lg:top-24 lg:p-5">
            <p className="tabular-nums">
              <b className="text-[28px]">{formatNaira(c.fromRateKobo)}</b>
              <span className="text-sm text-muted"> / night</span>
            </p>
            <div className="mt-3">
              <BookingBar variant="card" nightlyKobo={c.fromRateKobo} room={{ slug: c.slug, name: c.name, sleeps: c.maxOccupancy }} />
            </div>
            {freeCancel ? <p className="mt-3 text-center text-[13px] text-muted max-lg:hidden">{freeCancel}</p> : null}
          </aside>
        </div>
      </Container>

      <RoomPriceBar price={formatNaira(c.fromRateKobo)} targetId="availability" />
    </>
  );
}
