"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils/cn";
import { managementNav } from "./nav-items";



function isActive(pathname: string, href: string, base: string) {
  return href === base ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
}

type NavProps = {
  footer?: React.ReactNode;
  /** `base` lets the design preview reuse this shell under /preview/app. */
  base?: string;
  /** App hrefs this staff member may see (decided on the server by role). Omit for all. */
  allowed?: readonly string[];
};

function NavLinks({ onNavigate, base, allowed }: { onNavigate?: () => void; base: string; allowed?: readonly string[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Management" className="flex flex-col gap-1 px-3">
      {managementNav.filter((item) => !allowed || allowed.includes(item.href)).map(({ href: appHref, label, icon: Icon }) => {
        const href = appHref.replace(/^\/app/, base);
        const active = isActive(pathname, href, base);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-white/10 text-white" : "text-ivory-200/70 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className={cn("size-[18px]", active ? "text-gold-400" : "")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ base }: { base: string }) {
  return (
    <Link href={base} className="flex items-center gap-3 px-5">
      <Logo className="w-8" />
      <span className="leading-none">
        <span className="block font-display text-lg text-ivory-50">Victoria Luxury</span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.25em] text-gold-300">Management</span>
      </span>
    </Link>
  );
}

export function Sidebar({ footer, base = "/app", allowed }: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-950 py-6 lg:flex print:hidden">
      <Brand base={base} />
      <div className="mt-8 flex-1">
        <NavLinks base={base} allowed={allowed} />
      </div>
      {footer ? <div className="border-t border-white/10 px-5 pt-5">{footer}</div> : null}
    </aside>
  );
}

/**
 * Phones and tablets: a top bar that stays put while scrolling, and a full
 * menu. While the menu is open the page behind doesn't scroll, Tab stays in
 * the menu, and Escape or any navigation closes it.
 */
export function MobileBar({ footer, base = "/app", allowed }: NavProps) {
  const pathname = usePathname();
  // The page the menu was opened on: navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = useCallback(() => setOpenOn(null), []);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useDialog(open, close, panel, toggle);

  return (
    <div className="sticky top-0 z-40 lg:hidden print:hidden">
      <div className="flex h-14 items-center justify-between bg-navy-950 pr-1.5">
        <Brand base={base} />
        <button
          ref={toggle}
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="management-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-11 items-center justify-center rounded-md text-ivory-100 hover:bg-white/10"
        >
          {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
        </button>
      </div>
      {open ? (
        <div
          ref={panel}
          id="management-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-x-0 top-14 bottom-0 z-50 flex flex-col overflow-y-auto bg-navy-950 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <NavLinks base={base} allowed={allowed} onNavigate={close} />
          {footer ? <div className="mt-auto border-t border-white/10 px-5 pt-5">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
