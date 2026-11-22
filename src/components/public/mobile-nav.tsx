"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MapPin, Menu, MessageCircle, Phone, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";

/**
 * Phone menu. Full screen below the header, with large 56px rows; Call and
 * WhatsApp live here because the desktop contact strip is hidden on phones.
 * While open: the page behind doesn't scroll, Tab stays inside the menu, and
 * Escape closes it and returns focus to the menu button.
 *
 * The panel is rendered into <body>: the header uses backdrop-blur, which
 * makes it the containing block for `position: fixed` children, so a panel
 * inside it would be clipped to the header's 64px.
 */
const noop = () => () => {};
export function MobileNav({ items }: { items: ReadonlyArray<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button") ?? []).concat(toggle.current ? [toggle.current] : []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Browser back/forward is a route change too: close.
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [open]);

  const close = () => setOpen(false);
  // Portals need the DOM: render the panel only after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div className="md:hidden">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="-mr-2 flex size-11 items-center justify-center rounded-md text-navy-950 hover:bg-ivory-200"
      >
        {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
      </button>
      {mounted ? createPortal(
        <div
          ref={panel}
          id="mobile-menu"
          hidden={!open}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-x-0 top-16 bottom-0 z-50 flex-col overflow-y-auto bg-ivory-50 [&:not([hidden])]:flex"
        >
          <nav aria-label="Mobile" className="flex flex-1 flex-col px-4 pt-2">
            {[{ href: "/", label: "Home" }, ...items].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="flex min-h-14 items-center border-b border-ivory-200 font-display text-3xl text-navy-950 hover:text-gold-600"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-3 border-t border-ivory-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${hotel.phone}`} className={buttonStyles({ variant: "secondary", size: "lg", className: "gap-2" })}>
                <Phone className="size-4" aria-hidden /> Call
              </a>
              <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", size: "lg", className: "gap-2" })}>
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
            </div>
            <Link href="/book" onClick={close} className={buttonStyles({ variant: "accent", size: "lg", className: "w-full" })}>
              Book your stay
            </Link>
            <a href={hotel.mapsUrl} className="flex items-center justify-center gap-1.5 py-1 text-xs text-ink-500">
              <MapPin className="size-3.5 text-gold-600" aria-hidden /> {hotel.address.line1}, {hotel.address.city}
            </a>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
