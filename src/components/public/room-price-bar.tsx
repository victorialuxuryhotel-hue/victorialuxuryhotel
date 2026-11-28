"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const noop = () => () => {};

export function RoomPriceBar({ price, targetId }: { price: string; targetId: string }) {
  const [formVisible, setFormVisible] = useState(false);
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    const form = document.getElementById(targetId);
    if (!form) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(e!.isIntersecting), { threshold: 0.2 });
    io.observe(form);
    return () => io.disconnect();
  }, [targetId]);

  function chooseDates() {
    const form = document.getElementById(targetId);
    form?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Open the dates sheet (design M5 → D5).
    form?.querySelector<HTMLButtonElement>("[data-dates-trigger]")?.click();
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden",
          formVisible ? "pointer-events-none translate-y-full" : "translate-y-0",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="leading-tight">
            <span className="block text-xs text-muted">From, per night</span>
            <span className="block text-xl font-bold text-ink-900 tabular-nums">{price}</span>
          </p>
          <button type="button" onClick={chooseDates} tabIndex={formVisible ? -1 : 0} className={buttonStyles({ size: "lg", className: "flex-1" })}>
            Choose dates
          </button>
        </div>
      </div>
      {mounted ? createPortal(<div aria-hidden className="h-20 shrink-0 bg-[#0b1f5c] lg:hidden" />, document.body) : null}
    </>
  );
}
