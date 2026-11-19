"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export function MobileNav({ items }: { items: ReadonlyArray<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);

  // Lock page scroll while open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="-mr-2 rounded-md p-2 text-navy-950 hover:bg-ivory-200"
      >
        {open ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>
      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 top-16 bottom-0 z-50 overflow-y-auto bg-ivory-50"
      >
        <nav aria-label="Mobile" className="flex flex-col px-4 py-6">
          {[{ href: "/", label: "Home" }, ...items].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="border-b border-ivory-200 py-4 font-display text-3xl text-navy-950 hover:text-gold-600"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/book" onClick={() => setOpen(false)} className={buttonStyles({ size: "lg", className: "mt-8" })}>
            Book your stay
          </Link>
        </nav>
      </div>
    </div>
  );
}
