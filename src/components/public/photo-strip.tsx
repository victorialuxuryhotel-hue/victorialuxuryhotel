"use client";

import { Children, useEffect, useRef, useState } from "react";

/** Phones: a swipeable strip of photos with "2 / 5 photos" beneath it. */
export function PhotoStrip({ children, label }: { children: React.ReactNode; label: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
      setIndex(Math.min(count - 1, Math.round(el.scrollLeft / Math.max(1, step))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  return (
    <div className="sm:hidden">
      <div
        ref={strip}
        role="region"
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:w-[88%] [&>*]:shrink-0 [&>*]:snap-start"
      >
        {children}
      </div>
      {count > 1 ? (
        <p className="mt-2 text-right text-xs text-ink-500 tabular-nums" aria-live="polite">
          {index + 1} / {count} photos
        </p>
      ) : null}
    </div>
  );
}
