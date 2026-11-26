"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BedDouble, CalendarCheck, Search, UserRound } from "lucide-react";
import { formatDate } from "@/lib/format";
import { withBooking } from "@/lib/panel";
import { cn } from "@/lib/utils/cn";
import type { SearchResults } from "@/server/domain/search";
import { searchEverything } from "@/server/search";

export const OPEN_SEARCH = "victoria:open-search";
/** Pages that show the booking side panel themselves (I7); elsewhere a booking opens on Bookings. */
const PANEL_PAGES = ["/app/today", "/app/calendar", "/app/reservations"];
/** No global search on the till (interface brief I9). */
export const onTill = (path: string) => path === "/app/sales";

type Hit = { key: string; group: "Guests" | "Bookings" | "Rooms"; label: string; detail: string; href: string };

function hits(r: SearchResults, pathname: string): Hit[] {
  const bookingHref = (ref: string) =>
    PANEL_PAGES.includes(pathname)
      ? withBooking(pathname, Object.fromEntries(new URLSearchParams(window.location.search)), ref)
      : withBooking("/app/reservations", { tab: "all" }, ref);
  return [
    ...r.bookings.map((b) => ({ key: `b${b.id}`, group: "Bookings" as const, label: `${b.guestName} · ${b.reference}`, detail: `${formatDate(b.checkIn, { year: false })} → ${formatDate(b.checkOut, { year: false })}`, href: bookingHref(b.reference) })),
    ...r.guests.map((g) => ({ key: `g${g.id}`, group: "Guests" as const, label: g.name, detail: g.phone ?? g.email ?? "", href: `/app/guests/${g.id}` })),
    ...r.rooms.map((x) => ({ key: `r${x.id}`, group: "Rooms" as const, label: `Room ${x.number}`, detail: x.category, href: `/app/rooms#room-${x.number}` })),
  ];
}

const ICON = { Guests: UserRound, Bookings: CalendarCheck, Rooms: BedDouble };

/** The search box at the top of the menu, and the results over the page. Ctrl K (or "/" where a page has no search box of its own). */
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const till = onTill(pathname);

  useEffect(() => {
    if (till) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH, onOpen);
    };
  }, [till]);

  // Debounced 200ms; an answer for older typing is ignored.
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchEverything(term).then((r) => {
        if (live) {
          setFound({ q: term, hits: hits(r, pathname) });
          setActive(0);
        }
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term, pathname]);

  if (till) return null;
  const list = term.length >= 2 && found.q === term ? found.hits : [];
  const close = () => {
    setOpen(false);
    setQ("");
  };
  const go = (h: Hit) => {
    close();
    router.push(h.href, { scroll: h.group !== "Bookings" });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K"
        className={cn(
          "flex items-center gap-2 rounded-md border border-white/15 text-left text-sm text-ivory-200/70 hover:bg-ivory-50/10 hover:text-white",
          compact ? "size-11 justify-center border-0" : "mx-5 mt-6 h-10 w-[calc(100%-2.5rem)] px-3",
        )}
        data-global-search=""
      >
        <Search className="size-4 shrink-0" aria-hidden />
        {compact ? <span className="sr-only">Search guests, bookings, rooms</span> : <><span className="flex-1 truncate">Search…</span><kbd className="hidden rounded border border-white/20 px-1 font-mono text-[11px] pointer-fine:inline">Ctrl K</kbd></>}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[60] print:hidden" role="presentation">
          <button type="button" aria-label="Close search" tabIndex={-1} onClick={close} className="absolute inset-0 h-full w-full cursor-default bg-navy-950/30" />
          <div role="dialog" aria-modal="true" aria-label="Search" className="relative mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-card border border-hairline bg-ivory-50 shadow-xl">
            <div className="flex items-center gap-2 border-b border-hairline px-4">
              <Search className="size-5 shrink-0 text-ink-400" aria-hidden />
              <input
                ref={input}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  else if (e.key === "Enter" && list[active]) { e.preventDefault(); go(list[active]!); }
                }}
                placeholder="Search guests, bookings, rooms…"
                aria-label="Search guests, bookings, rooms"
                role="combobox"
                aria-expanded={list.length > 0}
                aria-controls="global-search-results"
                aria-activedescendant={list[active] ? `gs-${list[active]!.key}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>
            <ul id="global-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto py-1">
              {list.map((h, i) => {
                const Icon = ICON[h.group];
                const first = i === 0 || list[i - 1]!.group !== h.group;
                return (
                  <li key={h.key} role="presentation">
                    {first ? <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-[0.15em] text-ink-500">{h.group}</p> : null}
                    <button
                      id={`gs-${h.key}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", i === active && "bg-navy-50")}
                    >
                      <Icon className="size-4 shrink-0 text-ink-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-ink-900">{h.label}</span>
                      <span className="shrink-0 text-sm text-ink-500">{h.detail}</span>
                    </button>
                  </li>
                );
              })}
              {term.length >= 2 && found.q === term && !list.length ? <li className="px-4 py-6 text-sm text-ink-500">Nothing found for “{term}”.</li> : null}
              {term.length < 2 ? <li className="px-4 py-6 text-sm text-ink-500">Type a name, phone number, booking reference or room number.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
