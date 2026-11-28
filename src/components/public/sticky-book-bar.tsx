"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function StickyBookBar() {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/book") || /^\/rooms\/[^/]+$/.test(pathname);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (hidden) return;
    const form = document.querySelector("[data-booking-search]");
    if (form) {
      const io = new IntersectionObserver(([e]) => setShow(!e!.isIntersecting && e!.boundingClientRect.top < 0));
      io.observe(form);
      return () => io.disconnect();
    }
    const onScroll = () => setShow(window.scrollY > 360);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hidden, pathname]);

  const onRooms = pathname === "/rooms";
  function openSearch() {
    const form = document.querySelector<HTMLElement>("[data-booking-search]");
    form?.scrollIntoView({ behavior: "smooth", block: "center" });
    form?.querySelector<HTMLButtonElement>("[data-dates-trigger]")?.click();
  }

  if (hidden) return null;
  return (
    <>
      <div aria-hidden className="h-20 bg-[#0b1f5c] lg:hidden" />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden",
          show ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        aria-hidden={!show}
      >
        <div className="flex items-center justify-between gap-3">
          {onRooms ? null : (
            <p className="min-w-0 leading-tight">
              <span className="block text-xs text-ink-500">Book direct</span>
              <span className="block text-sm font-medium text-navy-950">Instant confirmation</span>
            </p>
          )}
          {onRooms ? (
            <button type="button" tabIndex={show ? 0 : -1} onClick={openSearch} className={buttonStyles({ size: "lg", className: "w-full px-4" })}>
              Add dates to see what&apos;s free
            </button>
          ) : (
            <Link href="/book" tabIndex={show ? 0 : -1} className={buttonStyles({ size: "lg", className: "shrink-0 px-4 whitespace-nowrap min-[360px]:px-5" })}>
              Check availability
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
