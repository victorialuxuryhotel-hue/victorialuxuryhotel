"use client";

import { Children, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

export function ScrollRail({ children, className, label, tone = "light" }: { children: React.ReactNode; className?: string; label: string; tone?: "light" | "dark" }) {
  const rail = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
      setActive(Math.min(count - 1, Math.round(el.scrollLeft / Math.max(1, step))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  return (
    <div>
      <div
        ref={rail}
        role="region"
        aria-label={label}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden",
          "[&>*]:w-[72%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto",
          className,
        )}
      >
        {children}
      </div>
      {count > 1 ? (
        <div className="mt-4 flex justify-center gap-1.5 sm:hidden" aria-hidden>
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-0.5 w-4.5 transition-colors",
                i === active ? "bg-gold-500" : tone === "dark" ? "bg-ivory-50/25" : "bg-ink-300",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
