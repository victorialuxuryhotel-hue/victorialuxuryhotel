"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const noop = () => () => {};

/**
 * Phones and tablets: the room's price pinned to the bottom of the screen.
 * "Choose dates" jumps to the availability form and opens the check-in date
 * picker. Hidden while the form itself is on screen.
 */
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
    const input = form?.querySelector<HTMLInputElement>('input[name="checkIn"]');
    if (!input) return;
    input.focus({ preventScroll: true });
    try {
      input.showPicker?.();
    } catch {
      // Some browsers only allow the picker from a direct tap on the input.
    }
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ivory-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden",
          formVisible ? "pointer-events-none translate-y-full" : "translate-y-0",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="leading-tight">
            <span className="block text-xs text-ink-500">From</span>
            <span className="block text-base text-navy-950 tabular-nums">
              {price} <span className="text-xs text-ink-500">/ night</span>
            </span>
          </p>
          <button type="button" onClick={chooseDates} tabIndex={formVisible ? -1 : 0} className={buttonStyles({ variant: "accent", size: "lg", className: "px-6" })}>
            Choose dates
          </button>
        </div>
      </div>
      {/* Room at the very end of the page so the bar never covers the footer. */}
      {mounted ? createPortal(<div aria-hidden className="h-20 shrink-0 bg-navy-950 md:hidden" />, document.body) : null}
    </>
  );
}
