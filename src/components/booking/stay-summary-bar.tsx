"use client";

import { useState } from "react";
import { BookingBar } from "@/components/public/booking-bar";
import { formatDate, plural } from "@/lib/format";

export function StaySummaryBar({ checkIn, checkOut, guests, nights }: { checkIn: string; checkOut: string; guests: number; nights: number }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-1">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-ink-800 tabular-nums">
          <span className="font-medium">{formatDate(checkIn, { year: false })} → {formatDate(checkOut, { year: false })}</span>
          <span className="text-ink-500"> · {plural(nights, "night")} · {plural(guests, "guest")}</span>
        </p>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-controls="edit-stay"
          className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-navy-800 hover:text-gold-600"
        >
          {editing ? "Close" : "Change"}
        </button>
      </div>
      {editing ? (
        <div id="edit-stay" className="pt-2 pb-1">
          <BookingBar variant="inline" defaults={{ checkIn, checkOut, guests: String(guests) }} />
        </div>
      ) : null}
    </div>
  );
}
