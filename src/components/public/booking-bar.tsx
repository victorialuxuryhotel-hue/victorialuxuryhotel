"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { buttonStyles } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { tonight } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { GuestsPicker, MAX_GUESTS, partyLabel, type Party } from "./guests-picker";
import { RangeCalendar } from "./range-calendar";

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const noopSubscribe = () => () => {};

function addDays(iso: string, days: number) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

const short = (iso: string) => (iso ? formatDate(iso, { year: false }) : "Choose");
/** "Sat 5 – Mon 7 Dec" (design M1). */
function rangeLabel(a: string, b: string) {
  if (!a || !b) return "Choose dates";
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  const from = formatDate(a, { year: false });
  return `${sameMonth ? from.replace(/ \w+$/, "") : from} – ${formatDate(b, { year: false })}`;
}

const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // Some browsers only open the picker from the icon; the field still works by keyboard.
  }
};

/**
 * The date and guests search (designs G1, G2, G3, M1, D4, D5). It submits `checkIn`, `checkOut` and
 * `guests` (adults and children together) to /book, as before.
 * - `bar`: one row on a computer (Arrive · Leave · Guests · See rooms); stacked on a phone.
 * - `card`: the room page's booking box, with the price for the chosen nights.
 */
export function BookingBar({
  variant = "bar",
  defaults,
  nightlyKobo,
  room,
  collapsible,
  className,
}: {
  variant?: "bar" | "card";
  /** Show what the chosen dates cost at this nightly rate. */
  nightlyKobo?: number;
  /** On a room page: its name, slug and how many it sleeps, so /book opens with it chosen. */
  room?: { slug: string; name?: string; sleeps?: number };
  /** On a phone, show one line ("Sat 5 – Mon 7 Dec · 2 adults  Change") until the guest asks to change it (M4). */
  collapsible?: boolean;
  className?: string;
  defaults?: { checkIn?: string; checkOut?: string; guests?: string };
}) {
  // Lagos time with the 06:00 cut-off, whatever the visitor's own clock or time zone says.
  const today = useSyncExternalStore(noopSubscribe, () => tonight(), () => "");
  const [checkInValue, setCheckIn] = useState(defaults?.checkIn ?? "");
  const [checkOutValue, setCheckOut] = useState(defaults?.checkOut ?? "");
  const [party, setParty] = useState<Party>(() => ({ adults: Math.min(MAX_GUESTS, Math.max(1, Number(defaults?.guests) || 2)), children: 0 }));
  const [sheet, setSheet] = useState<"dates" | "guests" | null>(null);
  const [expanded, setExpanded] = useState(!collapsible);
  const id = useId();
  const datesButton = useRef<HTMLButtonElement>(null);
  const guestsButton = useRef<HTMLButtonElement>(null);
  const checkIn = checkInValue || today;
  const checkOut = checkOutValue || addDays(checkIn, 1);
  const guests = party.adults + party.children;
  const nights = checkIn && checkOut ? Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 864e5) : 0;
  const card = variant === "card";
  const note = room?.name && room.sleeps ? `${room.name} sleeps ${room.sleeps}` : undefined;

  const label = "text-xs font-semibold text-muted";
  const box = "relative flex h-11 items-center justify-between gap-2.5 rounded-lg border border-[#bdb7a8] bg-white px-3 text-sm text-ink-900 focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-navy-700/20";
  const dateInput = "absolute inset-0 size-full cursor-pointer opacity-0";

  const setDates = (a: string, b: string) => {
    setCheckIn(a);
    setCheckOut(b);
  };
  const changeIn = (v: string) => {
    setCheckIn(v);
    if (v && checkOut <= v) setCheckOut(addDays(v, 1));
  };

  const guestsPopover = (trigger: React.ReactNode, triggerClassName: string, align: "end" | "stretch") => (
    <Popover label="Who's staying?" trigger={trigger} triggerClassName={triggerClassName} align={align} panelClassName="w-[22rem] max-w-[calc(100vw-2rem)] px-4 pt-1.5 pb-3">
      {(close) => <GuestsPicker party={party} onChange={setParty} onDone={close} note={note} />}
    </Popover>
  );

  const total =
    nightlyKobo && nights > 0 ? (
      <p aria-live="polite" className="flex justify-between gap-4 border-t border-hairline pt-2 text-[15px] tabular-nums">
        <span>{plural(nights, "night")}</span>
        <b>{formatNaira(nightlyKobo * nights)}</b>
      </p>
    ) : null;

  return (
    <>
      {collapsible && !expanded ? (
        <div className={cn("flex items-center justify-between gap-3 rounded-xl border border-hairline bg-white py-1 pr-1 pl-4 lg:hidden", className)}>
          <p className="min-w-0 text-sm text-ink-900 tabular-nums">
            {checkInValue ? <><b>{rangeLabel(checkIn, checkOut)}</b> · {partyLabel(party)}</> : "Add your dates to see what's free"}
          </p>
          <button type="button" onClick={() => setExpanded(true)} aria-controls={`${id}-search`} className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold text-navy-700">
            {checkInValue ? "Change" : "Add dates"}
          </button>
        </div>
      ) : null}
      <form
        id={`${id}-search`}
        action="/book"
        method="get"
        data-booking-search
        className={cn(
          "font-sans tabular-nums",
          collapsible && !expanded && "max-lg:hidden",
          card ? "flex flex-col gap-3" : "flex flex-col gap-2.5 rounded-xl bg-white p-3 lg:flex-row lg:items-center lg:gap-0 lg:py-3.5 lg:pr-3.5 lg:pl-0",
          !card && "shadow-[0_10px_30px_rgba(11,31,92,0.18)]",
          className,
        )}
      >
        <input type="hidden" name="checkIn" value={checkIn} />
        <input type="hidden" name="checkOut" value={checkOut} />
        <input type="hidden" name="guests" value={guests} />
        {room ? <input type="hidden" name="room" value={room.slug} /> : null}

        {/* Phone: dates and guests open bottom sheets (M1, D5). */}
        <div className="flex flex-col gap-1 lg:hidden">
          <span className={label} id={`${id}-dates-label`}>Dates</span>
          <button ref={datesButton} type="button" data-dates-trigger aria-labelledby={`${id}-dates-label ${id}-dates-value`} onClick={() => setSheet("dates")} className={box}>
            <span id={`${id}-dates-value`}>{rangeLabel(checkIn, checkOut)}</span>
            <ChevronDown className="size-4 text-muted" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-1 lg:hidden">
          <span className={label} id={`${id}-guests-label-m`}>Guests</span>
          <button ref={guestsButton} type="button" aria-labelledby={`${id}-guests-label-m ${id}-guests-value-m`} onClick={() => setSheet("guests")} className={box}>
            <span id={`${id}-guests-value-m`}>{partyLabel(party)}</span>
            <ChevronDown className="size-4 text-muted" aria-hidden />
          </button>
        </div>

        {/* Computer. */}
        {card ? (
          <>
            <div className="hidden grid-cols-2 gap-2.5 lg:grid">
              <label className="flex flex-col gap-1">
                <span className={label}>Arrive</span>
                <span className={box}>
                  {short(checkIn)}
                  <ChevronDown className="size-4 text-muted" aria-hidden />
                  <input type="date" required min={today || undefined} value={checkIn} onChange={(e) => changeIn(e.target.value)} onClick={openPicker} className={dateInput} />
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className={label}>Leave</span>
                <span className={box}>
                  {short(checkOut)}
                  <ChevronDown className="size-4 text-muted" aria-hidden />
                  <input type="date" required min={addDays(checkIn, 1) || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} onClick={openPicker} className={dateInput} />
                </span>
              </label>
            </div>
            <div className="hidden flex-col gap-1 lg:flex">
              <span className={label}>Guests</span>
              {guestsPopover(<><span>{partyLabel(party)}</span><ChevronDown className="size-4 text-muted" aria-hidden /></>, cn(box, "w-full"), "stretch")}
            </div>
          </>
        ) : (
          <>
            <label className="relative hidden flex-1 flex-col gap-1 border-r border-hairline px-[18px] focus-within:bg-ivory-100 lg:flex">
              <span className={label}>Arrive</span>
              <span className="text-base font-semibold">{short(checkIn)}</span>
              <input type="date" required min={today || undefined} value={checkIn} onChange={(e) => changeIn(e.target.value)} onClick={openPicker} className={dateInput} />
            </label>
            <label className="relative hidden flex-1 flex-col gap-1 border-r border-hairline px-[18px] focus-within:bg-ivory-100 lg:flex">
              <span className={label}>Leave</span>
              <span className="text-base font-semibold">{short(checkOut)}{nights > 0 ? ` · ${plural(nights, "night")}` : ""}</span>
              <input type="date" required min={addDays(checkIn, 1) || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} onClick={openPicker} className={dateInput} />
            </label>
            <div className="hidden flex-1 border-r border-hairline lg:block">
              {guestsPopover(
                <>
                  <span className={label}>Guests</span>
                  <span className="text-base font-semibold">{partyLabel(party)}</span>
                </>,
                "flex w-full flex-col items-start gap-1 px-[18px] text-left hover:bg-ivory-100",
                "stretch",
              )}
            </div>
          </>
        )}

        {card ? total : null}
        <button type="submit" className={buttonStyles({ size: "lg", className: cn("w-full", !card && "mt-1 lg:mt-0 lg:ml-3.5 lg:w-auto") })}>
          {card ? "Book this room" : "See rooms"}
        </button>
      </form>

      <BottomSheet open={sheet === "dates"} onClose={() => setSheet(null)} title="When are you staying?" trigger={datesButton}>
        <RangeCalendar start={checkIn} end={checkOut} min={today} onChange={setDates} />
        <button type="button" onClick={() => setSheet(null)} className={buttonStyles({ size: "lg", className: "mt-3 w-full" })}>Done</button>
      </BottomSheet>
      <BottomSheet open={sheet === "guests"} onClose={() => setSheet(null)} title="Who's staying?" trigger={guestsButton}>
        <GuestsPicker party={party} onChange={setParty} onDone={() => setSheet(null)} large />
        {note ? <p className="mt-2 text-center text-[13px] text-muted">{note}</p> : null}
      </BottomSheet>
    </>
  );
}
