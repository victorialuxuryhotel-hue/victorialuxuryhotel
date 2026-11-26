import Link from "next/link";
import { ChevronRight, MessageCircle, Phone } from "lucide-react";
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
    <li className={cn("flex flex-col overflow-hidden rounded-card border border-hairline bg-white sm:flex-row", full && "bg-ivory-50")}>
      <Photo photo={o.photo ?? { alt: o.name }} className={cn("aspect-video sm:aspect-auto sm:min-h-[150px] sm:w-56 sm:shrink-0", full && "opacity-60")} sizes="(min-width: 640px) 14rem, 100vw" />
      <div className="flex flex-1 flex-wrap items-center justify-between gap-3.5 px-5 py-[18px]">
        <div className="min-w-0 flex-[1_1_13rem]">
          <h3 className={cn("font-sans text-[19px]", full ? "text-ink-500" : "text-navy-950")}>{o.name}</h3>
          {o.summary ? <p className="mt-1 text-sm text-ink-600">{o.summary}</p> : null}
          <p className="mt-1.5 text-[13px] text-ink-500">Sleeps up to {o.maxOccupancy}</p>
          <Link href={`/rooms/${o.slug}`} className="mt-0.5 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-navy-800 hover:text-gold-600">
            Photos &amp; details <span className="sr-only">of {o.name}</span> <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {full ? (
          <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
            <p className="rounded-full bg-ivory-200 px-3 py-1.5 text-[13px] font-medium text-ink-600">Fully booked for these dates</p>
            {switchHref ? (
              <Link href={switchHref} className={buttonStyles({ variant: "secondary", className: "h-11" })}>
                Free from {formatDate(o.freeFrom!, { year: false })} · switch dates
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex w-full items-end justify-between gap-4 sm:w-auto sm:flex-col sm:gap-2.5">
            <div className="sm:text-right">
              <p className="text-2xl font-semibold tabular-nums text-navy-950">{formatNaira(o.totalKobo)}</p>
              <p className="text-xs text-ink-500 tabular-nums">{formatNaira(o.nightlyRateKobo)} × {plural(o.nights, "night")}</p>
            </div>
            <Link href={selectHref(o)} className={buttonStyles({ className: "h-11 min-w-[104px] px-5" })}>
              Select <span className="sr-only">{o.name}</span>
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
          <ul className="space-y-3.5">
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
