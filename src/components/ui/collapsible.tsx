"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Minus, Plus } from "lucide-react";

const XL = "(min-width: 1280px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(XL);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function Collapsible({ id, title, wideHeader, children }: { id: string; title: string; wideHeader?: React.ReactNode; children: React.ReactNode }) {
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(XL).matches, () => false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }));
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [id]);

  if (wide) {
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
        className="flex min-h-13 w-full items-center justify-between gap-3 px-4 text-left text-base text-ink-900 sm:px-5"
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
