"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import type { FirstDayItem } from "@/content/help";
import { tickFirstDay } from "@/server/first-day";

/** "Your first day" (interface brief I10): the role's main jobs; the card goes once they're all ticked. */
export function FirstDayChecklist({ items, done }: { items: FirstDayItem[]; done: string[] }) {
  const [ticked, setTicked] = useOptimistic(done, (cur: string[], v: { key: string; on: boolean }) => (v.on ? [...cur, v.key] : cur.filter((k) => k !== v.key)));
  const [, start] = useTransition();
  const left = items.filter((i) => !ticked.includes(i.key)).length;
  return (
    <Card data-first-day="">
      <CardHeader title="Your first day" description={left ? `${left} of ${items.length} still to do. Tick each one once you've done it.` : "All done."} />
      <ul className="divide-y divide-hairline">
        {items.map((i) => {
          const on = ticked.includes(i.key);
          return (
            <li key={i.key} className="flex items-start gap-3 px-5 py-3">
              <input
                type="checkbox"
                id={`fd-${i.key}`}
                checked={on}
                onChange={(e) => {
                  const v = { key: i.key, on: e.target.checked };
                  start(async () => {
                    setTicked(v);
                    await tickFirstDay(v.key, v.on);
                  });
                }}
                className="mt-1 size-5 shrink-0 accent-navy-800"
              />
              <label htmlFor={`fd-${i.key}`} className="min-w-0 flex-1">
                <span className={on ? "text-ink-500 line-through" : "text-ink-900"}>{i.label}</span>
                <span className="block text-sm text-ink-500">{i.how}</span>
              </label>
              <Link href={i.href} className="shrink-0 text-sm font-medium text-navy-800 hover:underline">Go</Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
