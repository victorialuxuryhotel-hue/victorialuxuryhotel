"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Phones: filters fold away behind a 44px button so the search box stays
 * one row. From md they are always shown inline. Starts open when a filter
 * is already in use, so the guest list never looks unfiltered by mistake.
 */
export function FiltersToggle({ children, initiallyOpen = false }: { children: React.ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="list-filters"
        aria-label="Filters"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md border border-ink-300 bg-white text-ink-700 md:hidden",
          open && "border-navy-600 text-navy-800",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
      </button>
      <div id="list-filters" className={cn("col-span-2 grid-cols-2 gap-2 md:flex", open ? "grid" : "hidden")}>
        {children}
      </div>
    </>
  );
}
