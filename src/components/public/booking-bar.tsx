"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarDays, Minus, Plus, Users } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

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

const MIN_GUESTS = 1;
const MAX_GUESTS = 6;

export function BookingBar({
  variant = "floating",
  defaults,
}: {
  variant?: "floating" | "inline" | "stacked";
  defaults?: { checkIn?: string; checkOut?: string; guests?: string };
}) {
  const today = useSyncExternalStore(noopSubscribe, () => isoDate(new Date()), () => "");
  const [checkInValue, setCheckIn] = useState(defaults?.checkIn ?? "");
  const [checkOutValue, setCheckOut] = useState(defaults?.checkOut ?? "");
  const [guests, setGuests] = useState(() => Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Number(defaults?.guests) || 2)));
  const checkIn = checkInValue || today;
  const checkOut = checkOutValue || addDays(checkIn, 1);
  const row = variant !== "stacked";

  const label = "text-xs font-semibold uppercase tracking-[0.16em] text-ink-500 sm:text-xs sm:tracking-[0.18em]";
  const field = "mt-0.5 block w-full min-w-0 border-0 bg-transparent p-0 text-base font-medium text-navy-950 focus:outline-none focus:ring-0 sm:mt-1";
  const cell = "flex min-w-0 items-center gap-3 bg-ivory-50 px-3 py-2.5 sm:px-5 sm:py-4";
  const stepButton =
    "flex size-11 items-center justify-center rounded-md text-gold-600 hover:bg-ivory-100 disabled:text-ink-300 disabled:hover:bg-transparent";

  return (
    <form
      action="/book"
      method="get"
      data-booking-search
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-card bg-ivory-200",
        row && "sm:grid-cols-[1fr_1fr_0.8fr_auto]",
        variant === "floating" && "sm:shadow-[0_20px_50px_-12px_rgb(1_18_72/0.35)]",
      )}
    >
      <label className={cell}>
        <CalendarDays className="hidden size-5 shrink-0 text-gold-500 sm:block" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={label}>Check-in</span>
          <input
            type="date"
            name="checkIn"
            required
            min={today || undefined}
            value={checkIn}
            onChange={(e) => {
              const v = e.target.value;
              setCheckIn(v);
              if (v && checkOut <= v) setCheckOut(addDays(v, 1));
            }}
            className={field}
          />
        </span>
      </label>
      <label className={cell}>
        <CalendarDays className="hidden size-5 shrink-0 text-gold-500 sm:block" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={label}>Check-out</span>
          <input
            type="date"
            name="checkOut"
            required
            min={addDays(checkIn, 1) || undefined}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className={field}
          />
        </span>
      </label>
      <div className={cn("col-span-2 grid grid-cols-[1fr_auto] gap-px", row && "sm:col-span-1 sm:contents")}>
        <div className={cn(cell, "justify-between py-1 pr-1 sm:py-4 sm:pr-2")} role="group" aria-labelledby="guests-label">
          <Users className="hidden size-5 shrink-0 text-gold-500 sm:block" aria-hidden />
          <span className="min-w-0 flex-1">
            <span id="guests-label" className={label}>Guests</span>
            <output className="block text-base font-medium text-navy-950" aria-live="polite">
              {guests} {guests === 1 ? "guest" : "guests"}
            </output>
          </span>
          <input type="hidden" name="guests" value={guests} />
          <span className="flex shrink-0">
            <button type="button" className={stepButton} aria-label="Fewer guests" disabled={guests <= MIN_GUESTS} onClick={() => setGuests((g) => Math.max(MIN_GUESTS, g - 1))}>
              <Minus className="size-4" aria-hidden />
            </button>
            <button type="button" className={stepButton} aria-label="More guests" disabled={guests >= MAX_GUESTS} onClick={() => setGuests((g) => Math.min(MAX_GUESTS, g + 1))}>
              <Plus className="size-4" aria-hidden />
            </button>
          </span>
        </div>
        <button
          type="submit"
          className={buttonStyles({ variant: "accent", size: "lg", className: "h-auto min-h-12 rounded-none px-5 text-base sm:px-8 sm:py-4" })}
        >
          <span className="sm:hidden">Search</span>
          <span className="hidden sm:inline">Check availability</span>
        </button>
      </div>
    </form>
  );
}
