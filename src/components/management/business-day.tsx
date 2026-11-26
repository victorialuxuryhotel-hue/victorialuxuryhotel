"use client";

import { useSyncExternalStore } from "react";
import { CalendarClock } from "lucide-react";
import { businessDayNow } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";

// Re-read every minute, so the label turns over at 06:00 on a screen left open all night.
const everyMinute = (onChange: () => void) => {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
};

/** "Business day · Tue 24 Nov" (interface brief I5). Rendered in the browser only: the server has no "now" to share. */
export function BusinessDay({ className }: { className?: string }) {
  const label = useSyncExternalStore(everyMinute, () => businessDayNow(), () => null);
  if (!label) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", className)} data-business-day="">
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      {label}
    </p>
  );
}
