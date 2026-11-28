"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, Menu, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { guestFont } from "./guest-font";
import { useDialog } from "@/lib/use-dialog";

const noop = () => () => {};
export function MobileNav({ items }: { items: ReadonlyArray<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDialog(open, close, panel, toggle);

  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div className="lg:hidden">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-lg border border-[#cfcabd] bg-white text-ink-900 hover:bg-ivory-100"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {mounted ? createPortal(
        <div
          ref={panel}
          id="mobile-menu"
          hidden={!open}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`guest ${guestFont.variable} fixed inset-x-0 top-16 bottom-0 z-50 flex-col overflow-y-auto bg-white [&:not([hidden])]:flex`}
        >
          <nav aria-label="Mobile" className="flex flex-col px-4 pt-2">
            {[...items, { href: "/account", label: "My booking" }].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="flex min-h-14 items-center justify-between border-b border-hairline text-lg font-semibold text-ink-900 hover:text-navy-700"
              >
                {item.label}
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2.5 px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Link href="/book" onClick={close} className={buttonStyles({ size: "lg", className: "w-full" })}>
              Book now
            </Link>
            <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", className: "w-full" })}>
              Message us on WhatsApp
            </a>
            <p className="mt-2 text-center text-[13px] text-muted">
              Front desk open 24 hours · <a href={`tel:${hotel.phone}`} className="inline-flex min-h-11 items-center text-ink-900 underline-offset-2 hover:underline">{hotel.phoneDisplay}</a>
            </p>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
