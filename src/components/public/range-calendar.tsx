"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "@/lib/hotel-date";
import { formatDate, plural } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`));
const nextMonth = (ym: string, by: number) => {
  const d = new Date(`${ym}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
/** 0 = Monday. */
const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Arrival and departure on one month grid (design M6): the first tap is the arrival, the second the
 * departure; tapping on or before the arrival starts again.
 */
export function RangeCalendar({
  start,
  end,
  min,
  onChange,
}: {
  start: string;
  end: string;
  /** First day that can be picked (tonight, hotel time). */
  min: string;
  onChange: (start: string, end: string) => void;
}) {
  const [month, setMonth] = useState((start || min).slice(0, 7));
  const [picking, setPicking] = useState<"start" | "end">("start");
  const first = `${month}-01`;
  const cells: Array<string | null> = [...Array(weekday(first)).fill(null), ...Array.from({ length: daysIn(month) }, (_, i) => addDays(first, i))];
  const nights = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 864e5) : 0;

  function pick(day: string) {
    if (picking === "start" || day <= start) {
      onChange(day, addDays(day, 1));
      setPicking("end");
    } else {
      onChange(start, day);
      setPicking("start");
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => nextMonth(m, -1))}
          disabled={month <= min.slice(0, 7)}
          aria-label="Previous month"
          className="flex size-11 items-center justify-center rounded-lg border border-hairline disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p className="text-base font-bold text-ink-900" aria-live="polite">{monthName(month)}</p>
        <button type="button" onClick={() => setMonth((m) => nextMonth(m, 1))} aria-label="Next month" className="flex size-11 items-center justify-center rounded-lg border border-hairline">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div role="group" aria-label={monthName(month)} className="mt-2 grid grid-cols-7 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} aria-hidden className="pb-1 text-xs text-muted">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`x${i}`} />;
          const past = day < min;
          const isStart = day === start;
          const isEnd = day === end;
          const between = start && end && day > start && day < end;
          return (
            <button
              key={day}
              type="button"
              disabled={past}
              onClick={() => pick(day)}
              aria-pressed={isStart || isEnd}
              aria-label={`${formatDate(day)}${isStart ? ", arrival" : isEnd ? ", departure" : ""}`}
              className={cn(
                "h-11 text-[15px] tabular-nums disabled:text-ink-300",
                between && "bg-navy-50",
                isStart && "rounded-l-full bg-navy-900 font-bold text-white",
                isEnd && "rounded-r-full bg-navy-900 font-bold text-white",
                !isStart && !isEnd && !past && "hover:bg-ivory-100",
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[13px] text-muted" aria-live="polite">
        {start && end ? `${formatDate(start, { year: false })} → ${formatDate(end, { year: false })} · ${plural(nights, "night")}` : "Choose your arrival day"}
      </p>
    </div>
  );
}
