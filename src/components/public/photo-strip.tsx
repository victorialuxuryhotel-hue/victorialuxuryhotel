"use client";

import { Children, useEffect, useRef, useState } from "react";

/** Phone photo strip (design M5): full width, swipe through, "1 / 9 photos" in the corner. */
export function PhotoStrip({ children, label, overlay }: { children: React.ReactNode; label: string; overlay?: React.ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      setIndex(Math.min(count - 1, Math.round(el.scrollLeft / Math.max(1, first.offsetWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  return (
    <div className="relative lg:hidden">
      <div
        ref={strip}
        role="region"
        aria-label={label}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:w-full [&>*]:shrink-0 [&>*]:snap-start"
      >
        {children}
      </div>
      {overlay}
      {count > 1 ? (
        <p className="absolute right-3 bottom-3 rounded-full bg-ink-900/70 px-2.5 py-1 text-xs font-semibold text-white tabular-nums" aria-live="polite">
          {index + 1} / {count} photos
        </p>
      ) : null}
    </div>
  );
}
