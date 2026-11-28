"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BusinessDay } from "./business-day";
import { GlobalSearch } from "./global-search";
import { BedDouble, CalendarPlus, Menu, Search, Sun, X } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils/cn";
import { activeHref, managementNavGroups } from "./nav-items";

type NavProps = {
  footer?: React.ReactNode;
  base?: string;
  allowed?: readonly string[];
};

/** Global search only for roles that can open something it finds (guests, bookings or rooms). */
const canSearch = (base: string, allowed?: readonly string[]) =>
  base === "/app" && (!allowed || ["/app/guests", "/app/reservations", "/app/rooms"].some((h) => allowed.includes(h)));

function NavLinks({ onNavigate, base, allowed }: { onNavigate?: () => void; base: string; allowed?: readonly string[] }) {
  const pathname = usePathname();
  const groups = managementNavGroups
    .map((g) => ({
      label: g.label,
      items: g.items.filter((i) => !allowed || allowed.includes(i.href)).map((i) => ({ ...i, href: i.href.replace(/^\/app/, base) })),
    }))
    .filter((g) => g.items.length > 0);
  const active = activeHref(pathname, groups.flatMap((g) => g.items.map((i) => i.href)), base);
  const headings = groups.length > 1;
  return (
    <nav aria-label="Management" className="flex flex-col">
      {groups.map((g) => (
        <div key={g.label} role="group" aria-label={g.label} className="flex flex-col gap-0.5">
          {headings ? <p className="mt-[18px] mb-1.5 px-6 text-xs font-semibold tracking-[0.08em] text-[#8f99c2] uppercase">{g.label}</p> : null}
          {g.items.map(({ href, label }) => {
            const current = href === active;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "mx-3 flex min-h-10 items-center rounded-lg px-3 py-2 text-[15px] transition-colors pointer-coarse:min-h-11",
                  current ? "bg-white/12 font-semibold text-white" : "font-medium text-[#d3d9ee] hover:bg-white/5 hover:text-white",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** The wordmark (design D1): "Victoria Luxury" in the serif, MANAGEMENT in gold under it. */
function Brand({ base }: { base: string }) {
  return (
    <Link href={base} className="block px-6 leading-none">
      <span className="block font-brand text-[22px] text-white">Victoria Luxury</span>
      <span className="mt-1 block text-[11px] font-semibold tracking-[0.16em] text-gold-400">MANAGEMENT</span>
    </Link>
  );
}

export function Sidebar({ footer, base = "/app", allowed }: NavProps) {
  return (
    <aside data-app-nav="" className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[#0b1f5c] pt-[22px] lg:flex print:hidden">
      <Brand base={base} />
      {canSearch(base, allowed) ? <GlobalSearch /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <NavLinks base={base} allowed={allowed} />
      </div>
      {footer ? <div className="px-3 pt-2">{footer}</div> : null}
      <BusinessDay className="px-6 pt-2 pb-3 text-[#8f99c2]" />
    </aside>
  );
}

export function MobileBar({ footer, base = "/app", allowed }: NavProps) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = useCallback(() => setOpenOn(null), []);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useDialog(open, close, panel, toggle);

  return (
    <div data-app-nav="" className="sticky top-0 z-50 lg:hidden print:hidden">
      <div className="flex h-14 items-center justify-between bg-[#0b1f5c] pr-1.5">
        <Brand base={base} />
        <span className="ml-auto">{canSearch(base, allowed) ? <GlobalSearch compact /> : null}</span>
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
          className="fixed inset-x-0 top-14 bottom-0 z-50 flex flex-col overflow-y-auto bg-[#0b1f5c] py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <NavLinks base={base} allowed={allowed} onNavigate={close} />
          {footer ? <div className="mt-auto px-3 pt-5">{footer}</div> : null}
          <BusinessDay className="px-6 pt-2 text-[#8f99c2]" />
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
