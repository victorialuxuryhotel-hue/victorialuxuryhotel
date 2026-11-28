"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { Photo } from "@/components/public/photo";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { groupOptions } from "@/domain/availability";
import type { AvailabilityOption } from "@/domain/views";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { addDays } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { StayAside, stayDates } from "./booking-ui";
import { MobileActionBar } from "./mobile-action-bar";

type Stay = { checkIn: string; checkOut: string; guests: number };

function OptionCard({ o, stay, chosen, onChoose }: { o: AvailabilityOption; stay: Stay; chosen: boolean; onChoose: () => void }) {
  const full = !o.isAvailable;
  const switchHref = o.freeFrom
    ? `/book?${new URLSearchParams({ checkIn: o.freeFrom, checkOut: addDays(o.freeFrom, o.nights), guests: String(stay.guests) })}`
    : null;
  return (
    <li
      className={cn(
        "relative grid grid-cols-[88px_1fr_auto] items-center gap-3.5 rounded-[14px] border bg-white p-3 lg:grid-cols-[200px_1fr_220px] lg:gap-[22px] lg:p-4",
        chosen ? "border-2 border-navy-900" : "border-hairline",
        full && "text-ink-400",
      )}
    >
      <Photo photo={o.photo ?? { alt: o.name }} className={cn("h-[72px] rounded-lg lg:h-[130px] lg:rounded-[10px]", full && "opacity-50")} sizes="(min-width: 1024px) 200px, 88px" />
      <div className="flex min-w-0 flex-col items-start gap-1 lg:gap-1.5">
        <h3 className={cn("font-sans text-base font-bold lg:font-display lg:text-[28px] lg:leading-tight lg:font-semibold", full ? "text-ink-400" : "text-ink-900")}>{o.name}</h3>
        <p className={cn("text-[13px] lg:text-sm", full ? "text-ink-400" : "text-muted")}>
          Sleeps {o.maxOccupancy}<span className="hidden lg:inline"> · {formatNaira(o.nightlyRateKobo)} a night</span>
        </p>
        {full ? <Badge tone="danger">Sold out<span className="hidden lg:inline">&nbsp;for these dates</span></Badge> : <Badge tone="success" className="max-lg:hidden">Available</Badge>}
        <Link href={`/rooms/${o.slug}`} className="hidden min-h-8 items-center text-[13px] font-semibold text-navy-700 hover:underline lg:inline-flex">
          Photos &amp; details<span className="sr-only"> of {o.name}</span>
        </Link>
      </div>
      <div className="flex flex-col items-end gap-2 tabular-nums">
        <span className="hidden text-[13px] text-muted lg:block">{plural(o.nights, "night")}</span>
        <span className={cn("text-[15px] font-bold lg:text-2xl", full && "text-ink-400")}>{formatNaira(o.totalKobo)}</span>
        {full ? (
          <span className={buttonStyles({ variant: "secondary", className: "hidden cursor-default border-[#eceae4] bg-[#eceae4] text-ink-400 hover:bg-[#eceae4] lg:inline-flex" })}>Sold out</span>
        ) : (
          <button
            type="button"
            onClick={onChoose}
            aria-pressed={chosen}
            className={buttonStyles({ variant: chosen ? "primary" : "secondary", className: "max-lg:absolute max-lg:inset-0 max-lg:h-auto max-lg:w-auto max-lg:border-0 max-lg:bg-transparent max-lg:text-transparent max-lg:hover:bg-transparent" })}
          >
            {chosen ? "Selected ✓" : "Choose"}<span className="sr-only"> {o.name}</span>
          </button>
        )}
      </div>
      {full && switchHref ? (
        <Link href={switchHref} className={buttonStyles({ variant: "secondary", size: "sm", className: "col-span-3 justify-self-start" })}>
          Free from {formatDate(o.freeFrom!, { year: false })} · switch dates
        </Link>
      ) : null}
    </li>
  );
}

export function MoreThanOneRoom() {
  return (
    <div className="rounded-[14px] border border-hairline bg-ivory-100 p-5">
      <p className="font-semibold text-ink-900">Need more than one room? Call or WhatsApp us</p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <a href={`tel:${hotel.phone}`} className={buttonStyles({ variant: "secondary" })}><Phone className="size-4" aria-hidden /> Call</a>
        <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary" })}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      </div>
    </div>
  );
}

/**
 * Booking step 1 (designs G4, M6): choose a room type, see the total beside it, then Continue to your details.
 * `detailsPath` gets the room and the stay as its query.
 */
export function RoomResults({ options, stay, detailsPath = "/book/details", initial }: { options: AvailabilityOption[]; stay: Stay; detailsPath?: string; initial?: string }) {
  const { available, full, tooSmall } = groupOptions(options, stay.guests);
  const fitting = [...available, ...full];
  const [slug, setSlug] = useState(() => available.find((o) => o.slug === initial)?.slug ?? available[0]?.slug ?? null);
  const chosen = available.find((o) => o.slug === slug) ?? null;
  const href = chosen ? `${detailsPath}?${new URLSearchParams({ category: chosen.slug, checkIn: stay.checkIn, checkOut: stay.checkOut, guests: String(stay.guests) })}` : null;
  const guests = plural(stay.guests, "guest");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
      <div className="flex flex-col gap-3.5">
        <h2 className="font-sans text-base font-bold text-ink-900 lg:sr-only">Choose a room</h2>
        {fitting.length ? (
          <ul className="flex flex-col gap-3 lg:gap-3.5" aria-label={tooSmall.length ? `Fits ${plural(stay.guests, "guest")} in one room` : "Room types"}>
            {fitting.map((o) => <OptionCard key={o.slug} o={o} stay={stay} chosen={o.slug === slug} onChoose={() => setSlug(o.slug)} />)}
          </ul>
        ) : null}
        {tooSmall.length ? (
          <>
            <MoreThanOneRoom />
            <details className="group rounded-[14px] border border-hairline bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                Too small for {plural(stay.guests, "guest")} · {plural(tooSmall.length, "type")}
                <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {tooSmall.map((o) => (
                  <li key={o.slug} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>{o.name} <span className="text-muted">· sleeps {o.maxOccupancy}</span></span>
                    <span className="text-muted tabular-nums">{formatNaira(o.nightlyRateKobo)} a night</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </div>
      {chosen && href ? (
        <>
          <StayAside
            className="hidden lg:flex"
            rows={[["Dates", stayDates(stay.checkIn, stay.checkOut)], ["Guests", guests], ["Room", chosen.name]]}
            totalKobo={chosen.totalKobo}
          >
            <Link href={href} className={buttonStyles({ size: "lg", className: "w-full" })}>Continue</Link>
          </StayAside>
          <MobileActionBar label={`${chosen.name} · ${plural(chosen.nights, "night")}`} amount={formatNaira(chosen.totalKobo)}>
            <Link href={href} className={buttonStyles({ size: "lg", className: "flex-1" })}>Continue</Link>
          </MobileActionBar>
        </>
      ) : null}
    </div>
  );
}
