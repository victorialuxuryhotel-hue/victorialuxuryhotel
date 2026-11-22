"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CalendarPlus, Menu, Search, Sun, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils/cn";
import { activeHref, managementNavGroups } from "./nav-items";

type NavProps = {
  footer?: React.ReactNode;
  /** `base` lets the design preview reuse this shell under /preview/app. */
  base?: string;
  /** App hrefs this staff member may see (decided on the server by role). Omit for all. */
  allowed?: readonly string[];
};

function NavLinks({ onNavigate, base, allowed }: { onNavigate?: () => void; base: string; allowed?: readonly string[] }) {
  const pathname = usePathname();
  const groups = managementNavGroups
    .map((g) => ({
      label: g.label,
      items: g.items.filter((i) => !allowed || allowed.includes(i.href)).map((i) => ({ ...i, href: i.href.replace(/^\/app/, base) })),
    }))
    .filter((g) => g.items.length > 0);
  const active = activeHref(pathname, groups.flatMap((g) => g.items.map((i) => i.href)), base);
  // One group (front desk): no heading needed.
  const headings = groups.length > 1;
  return (
    <nav aria-label="Management" className="flex flex-col gap-5 px-3">
      {groups.map((g) => (
        <div key={g.label} role="group" aria-label={g.label} className="flex flex-col gap-1">
          {headings ? <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-ivory-200/45">{g.label}</p> : null}
          {g.items.map(({ href, label, icon: Icon }) => {
            const current = href === active;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  current ? "bg-ivory-50/10 text-white" : "text-ivory-200/70 hover:bg-ivory-50/5 hover:text-white",
                )}
              >
                <Icon className={cn("size-[18px]", current ? "text-gold-400" : "")} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ base }: { base: string }) {
  return (
    <Link href={base} className="flex items-center gap-3 px-5">
      <Logo className="w-8" />
      <span className="leading-none">
        <span className="block font-display text-lg text-ivory-50">Victoria Luxury</span>
        <span className="mt-0.5 block text-xs uppercase tracking-[0.25em] text-gold-300">Management</span>
      </span>
    </Link>
  );
}

export function Sidebar({ footer, base = "/app", allowed }: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-950 py-6 lg:flex print:hidden">
      <Brand base={base} />
      <div className="mt-8 min-h-0 flex-1 overflow-y-auto pb-4">
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
    <div className="sticky top-0 z-50 lg:hidden print:hidden">
      <div className="flex h-14 items-center justify-between bg-navy-950 pr-1.5">
        <Brand base={base} />
        <button
          ref={toggle}
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="management-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-11 items-center justify-center rounded-md text-ivory-100 hover:bg-ivory-50/10"
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

const deskTabs = [
  { href: "/app/today", label: "Today", icon: Sun },
  { href: "/app/rooms", label: "Rooms", icon: BedDouble },
  { href: "/app/reservations", label: "Find guest", icon: Search },
  { href: "/app/reservations/new", label: "New booking", icon: CalendarPlus },
] as const;

/**
 * Front desk, below md: the four things they do all day as a bottom tab bar.
 * Shown only on those four screens; a reservation's own page has its own
 * bottom bar (the next step), and two stacked bars would crowd the screen.
 */
export function DeskTabs({ base = "/app" }: { base?: string }) {
  const pathname = usePathname();
  const tabs = deskTabs.map((t) => ({ ...t, href: t.href.replace(/^\/app/, base) }));
  if (!tabs.some((t) => t.href === pathname)) return null;
  return (
    <>
      <div aria-hidden className="h-[calc(3.25rem+env(safe-area-inset-bottom))] md:hidden print:hidden" />
      <nav
        aria-label="Front desk"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-hairline bg-ivory-50 pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === pathname;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mt-px flex min-h-13 flex-col items-center justify-center gap-0.5 border-t-2 px-1 text-xs",
                active ? "border-gold-500 font-medium text-navy-900" : "border-transparent text-ink-500",
              )}
            >
              <Icon className={cn("size-5", active ? "text-navy-800" : "")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
