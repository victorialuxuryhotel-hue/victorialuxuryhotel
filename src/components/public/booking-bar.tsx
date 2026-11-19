"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarDays, Users } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function isoDate(d: Date) {
  // Local calendar date (the guest's), not UTC.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const noopSubscribe = () => () => {};

function addDays(iso: string, days: number) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/**
 * Availability search. Submits a plain GET to /book so it works without
 * JavaScript and the search is shareable. Validation of dates and capacity
 * happens on the server; this only guides the guest.
 */
export function BookingBar({
  variant = "floating",
  defaults,
}: {
  variant?: "floating" | "inline" | "stacked";
  defaults?: { checkIn?: string; checkOut?: string; guests?: string };
}) {
  // The guest's "today" is only known in the browser; on the server it is "".
  const today = useSyncExternalStore(noopSubscribe, () => isoDate(new Date()), () => "");
  const [checkInValue, setCheckIn] = useState(defaults?.checkIn ?? "");
  const [checkOutValue, setCheckOut] = useState(defaults?.checkOut ?? "");
  const checkIn = checkInValue || today;
  const checkOut = checkOutValue || addDays(checkIn, 1);

  const label = "text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500";
  const field =
    "mt-1 block w-full border-0 bg-transparent p-0 text-base font-medium text-navy-950 focus:outline-none focus:ring-0";

  return (
    <form
      action="/book"
      method="get"
      className={cn(
        "grid gap-px overflow-hidden rounded-card bg-ivory-200",
        variant !== "stacked" && "sm:grid-cols-[1fr_1fr_0.7fr_auto]",
        variant === "floating" && "shadow-[0_20px_50px_-12px_rgb(1_18_72/0.35)]",
      )}
    >
      <label className="flex items-center gap-3 bg-white px-5 py-4">
        <CalendarDays className="size-5 shrink-0 text-gold-500" aria-hidden />
        <span className="flex-1">
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
      <label className="flex items-center gap-3 bg-white px-5 py-4">
        <CalendarDays className="size-5 shrink-0 text-gold-500" aria-hidden />
        <span className="flex-1">
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
      <label className="flex items-center gap-3 bg-white px-5 py-4">
        <Users className="size-5 shrink-0 text-gold-500" aria-hidden />
        <span className="flex-1">
          <span className={label}>Guests</span>
          <select name="guests" defaultValue={defaults?.guests ?? "2"} className={field}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </span>
      </label>
      <button type="submit" className={buttonStyles({ variant: "accent", size: "lg", className: "h-auto rounded-none px-8 py-4 text-base" })}>
        Check availability
      </button>
    </form>
  );
}
