import Link from "next/link";
import { ChevronRight, MessageCircle, Phone, Users } from "lucide-react";
import { Photo } from "@/components/public/photo";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { groupOptions } from "@/domain/availability";
import type { AvailabilityOption } from "@/domain/views";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { addDays } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";

type Stay = { checkIn: string; checkOut: string; guests: number };

function OptionCard({ o, stay, selectHref }: { o: AvailabilityOption; stay: Stay; selectHref: (o: AvailabilityOption) => string }) {
  const full = !o.isAvailable;
  const switchHref = o.freeFrom
    ? `/book?${new URLSearchParams({ checkIn: o.freeFrom, checkOut: addDays(o.freeFrom, o.nights), guests: String(stay.guests) })}`
    : null;
  return (
    <li
      className={cn(
        "grid overflow-hidden rounded-card sm:grid-cols-[minmax(0,16rem)_1fr]",
        full ? "border-2 border-dashed border-ivory-300 bg-ivory-50" : "bg-ivory-50 shadow-card",
      )}
    >
      <Photo photo={o.photo ?? { alt: o.name }} className={cn("aspect-video sm:aspect-auto sm:h-full", full && "opacity-60")} sizes="(min-width: 640px) 16rem, 100vw" />
      <div className="flex flex-col gap-4 p-5 sm:p-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h3 className={cn("font-display text-3xl", full ? "text-ink-500" : "text-navy-950")}>{o.name}</h3>
          {o.summary ? <p className="mt-1 text-sm text-ink-600">{o.summary}</p> : null}
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-500"><Users className="size-4" aria-hidden /> Sleeps {o.maxOccupancy}</p>
          <Link href={`/rooms/${o.slug}`} className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm text-navy-800 underline-offset-2 hover:underline">
            Room details, photos and amenities <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        {full ? (
          <div className="shrink-0 md:text-right">
            <p className="text-sm font-medium text-ink-700">Full for these dates</p>
            {switchHref ? (
              <Link href={switchHref} className={buttonStyles({ variant: "secondary", className: "mt-3 h-11.5 w-full md:w-auto" })}>
                Free from {formatDate(o.freeFrom!, { year: false })} · switch dates
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex shrink-0 items-end justify-between gap-4 md:block md:text-right">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-navy-950">{formatNaira(o.totalKobo)}</p>
              <p className="text-sm text-ink-500 tabular-nums">{formatNaira(o.nightlyRateKobo)} a night</p>
            </div>
            <Link href={selectHref(o)} className={buttonStyles({ variant: "accent", className: "h-11.5 min-w-[104px] md:mt-3" })}>
              Choose
            </Link>
          </div>
        )}
      </div>
    </li>
  );
}

export function MoreThanOneRoom() {
  return (
    <div className="rounded-card border border-hairline bg-ivory-50 p-5">
      <p className="font-medium text-navy-950">Need more than one room? Call or WhatsApp us</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:flex">
        <a href={`tel:${hotel.phone}`} className={buttonStyles({ size: "md", className: "h-11.5" })}><Phone className="size-4" aria-hidden /> Call</a>
        <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ size: "md", variant: "secondary", className: "h-11.5" })}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      </div>
    </div>
  );
}

/**
 * Room types for a search. Guests choose a type, never a specific room, and
 * never see how many rooms are left. Free types that fit come first (cheapest
 * first), full ones after, and types too small for the party are folded away.
 */
export function RoomResults({ options, stay, selectHref }: { options: AvailabilityOption[]; stay: Stay; selectHref: (o: AvailabilityOption) => string }) {
  const { available, full, tooSmall } = groupOptions(options, stay.guests);
  const fitting = [...available, ...full];
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-600">
        {available.length} of {options.length} room types free for your dates
      </p>
      {fitting.length ? (
        <section aria-labelledby={tooSmall.length ? "fits" : undefined} className="space-y-4">
          {tooSmall.length ? <h2 id="fits" className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Fits {plural(stay.guests, "guest")} in one room</h2> : null}
          <ul className="space-y-5">
            {fitting.map((o) => <OptionCard key={o.slug} o={o} stay={stay} selectHref={selectHref} />)}
          </ul>
        </section>
      ) : null}
      {tooSmall.length ? (
        <>
          <MoreThanOneRoom />
          <details className="group rounded-card border border-hairline bg-ivory-50">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-ink-800 [&::-webkit-details-marker]:hidden">
              Too small for {plural(stay.guests, "guest")} · {plural(tooSmall.length, "type")}
              <span aria-hidden className="text-ink-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <ul className="divide-y divide-hairline border-t border-hairline">
              {tooSmall.map((o) => (
                <li key={o.slug} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="text-ink-800">{o.name} <span className="text-ink-500">· sleeps {o.maxOccupancy}</span></span>
                  <span className="tabular-nums text-ink-500">{formatNaira(o.nightlyRateKobo)} a night</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </div>
  );
}
