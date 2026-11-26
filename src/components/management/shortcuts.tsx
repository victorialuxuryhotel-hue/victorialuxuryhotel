"use client";

import { useEffect } from "react";
import { OPEN_SEARCH } from "./global-search";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * Front desk keyboard shortcuts (hardware brief H10): "/" jumps to the page's search box (Bookings,
 * Guests, Today); Esc closes an open popover such as Cancel booking (dialogs already close on Esc).
 * The till has no search box marked for "/", so nothing happens there.
 */
export function Shortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
        // The page's own search box if it has one (Today, Bookings, Guests), else global search (I9).
        const search = document.querySelector<HTMLInputElement>("[data-search]");
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        } else if (document.querySelector("[data-global-search]")) {
          e.preventDefault();
          window.dispatchEvent(new Event(OPEN_SEARCH));
        }
      } else if (e.key === "Escape") {
        const open = document.querySelector<HTMLDetailsElement>("details[data-popover][open]");
        if (open) {
          open.open = false;
          open.querySelector("summary")?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/** The small "/" hint shown in a search box on keyboard computers. */
export function SlashHint() {
  return (
    <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-hairline bg-ivory-100 px-1.5 font-mono text-xs text-ink-500 pointer-fine:md:block">/</kbd>
  );
}
