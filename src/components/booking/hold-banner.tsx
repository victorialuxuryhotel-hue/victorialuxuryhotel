"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export function HoldBanner({ category, expiresAt, againHref }: { category: string; expiresAt: string; againHref: string }) {
  const end = Date.parse(expiresAt);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(end - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [end]);

  if (left !== null && left <= 0) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger-700 px-4 py-3">
        <span className="text-[15px] text-ink-900">Your hold has ended</span>
        <Link href={againHref} className={buttonStyles({ variant: "secondary", className: "md:h-10" })}>Check again</Link>
      </div>
    );
  }
  return (
    <div role="timer" aria-live="off" className="flex items-center justify-between gap-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-ink-900"><Clock className="size-4 text-gold-600" aria-hidden />Your {category} room is held</span>
      <span className="shrink-0 text-sm font-semibold text-gold-900 tabular-nums">{left === null ? "" : `${mmss(left)} left`}</span>
    </div>
  );
}
