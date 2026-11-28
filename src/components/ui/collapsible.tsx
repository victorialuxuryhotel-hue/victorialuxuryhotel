"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Minus, Plus } from "lucide-react";

const XL = "(min-width: 1280px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(XL);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** `collapseWide`: stays folded on wide screens too, until opened or linked to (#id). */
export function Collapsible({ id, title, wideHeader, collapseWide = false, children }: { id: string; title: string; wideHeader?: React.ReactNode; collapseWide?: boolean; children: React.ReactNode }) {
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(XL).matches, () => false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }));
      }
    };
    // A link to #id opens it again even when the address already ends in #id.
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(`a[href="#${id}"]`)) setOpen(true);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [id]);

  if (wide && !collapseWide) {
    return (
      <div id={id}>
        {wideHeader}
        {children}
      </div>
    );
  }
  return (
    <div id={id} className="scroll-mt-28">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold text-navy-700 hover:bg-ivory-50"
      >
        {title}
        {open ? <Minus className="size-4 text-ink-500" aria-hidden /> : <Plus className="size-4 text-ink-500" aria-hidden />}
      </button>
      <div id={`${id}-body`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
