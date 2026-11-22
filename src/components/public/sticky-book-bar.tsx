"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Phones only: a booking bar pinned to the bottom of the screen once the
 * guest has scrolled past the page's own search form (or, on pages without
 * one, past the opening section). Hidden in the booking flow and on room
 * pages, which have their own pinned bar.
 */
export function StickyBookBar() {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/book") || /^\/rooms\/[^/]+$/.test(pathname);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (hidden) return;
    const form = document.querySelector("[data-booking-search]");
    if (form) {
      // Shown once the form has scrolled up out of view (not before it appears).
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
    form?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus({ preventScroll: true });
  }

  if (hidden) return null;
  return (
    <>
      {/* Room at the end of the page so the bar never covers the footer. */}
      <div aria-hidden className="h-20 bg-navy-950 md:hidden" />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-ivory-200 bg-ivory-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden",
          show ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        aria-hidden={!show}
      >
        <div className="flex items-center justify-between gap-3">
          {onRooms ? null : (
            <p className="leading-tight">
              <span className="block text-xs text-ink-500">Book direct</span>
              <span className="block text-sm font-medium text-navy-950">Instant confirmation</span>
            </p>
          )}
          {onRooms ? (
            // The rooms list shows no availability until there are dates: take the guest to the search on this page.
            <button type="button" tabIndex={show ? 0 : -1} onClick={openSearch} className={buttonStyles({ variant: "accent", size: "lg", className: "w-full px-4" })}>
              Add dates to see what&apos;s free
            </button>
          ) : (
            <Link href="/book" tabIndex={show ? 0 : -1} className={buttonStyles({ variant: "accent", size: "lg", className: "px-5" })}>
              Check availability
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
