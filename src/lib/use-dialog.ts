"use client";

import { useEffect, type RefObject } from "react";

export function useDialog(open: boolean, close: () => void, panel: RefObject<HTMLElement | null>, trigger?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const triggerEl = trigger?.current ?? null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).concat(
        triggerEl ? [triggerEl] : [],
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerEl?.focus();
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
    const onPop = () => close();
    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      triggerEl?.focus({ preventScroll: true });
    };
  }, [open, close, panel, trigger]);
}
