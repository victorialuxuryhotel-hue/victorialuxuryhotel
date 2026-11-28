"use client";

import { useState, type ReactNode } from "react";

/** A Today group (design R4): a heading with a count, and Hide / Show. Group, then list. */
export function TodaySection({ id, title, count, defaultOpen = true, tone, children }: { id: string; title: string; count: number; defaultOpen?: boolean; tone?: "danger"; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-labelledby={id} className="rounded-xl border border-hairline bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 id={id} className="flex items-center gap-2 text-base font-bold text-ink-900">
          {title}
          <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[13px] font-semibold tabular-nums ${tone === "danger" ? "bg-[#fde8e8] text-[#a61b1b]" : "bg-[#eceae4] text-ink-700"}`}>{count}</span>
        </h2>
        <button type="button" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen(!open)} className="text-sm font-semibold text-navy-700 hover:underline">
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open ? <div id={`${id}-list`} className="border-t border-hairline">{children}</div> : null}
    </section>
  );
}
