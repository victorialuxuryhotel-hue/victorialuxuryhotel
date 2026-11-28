"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/choice";
import { Input, Select } from "@/components/ui/form";
import { addDays } from "@/lib/hotel-date";

type Values = { from: string; to: string; method?: string; status?: string; outlet?: string; staffId?: string; q?: string };
type Range = "today" | "yesterday" | "week" | "month" | "custom";

const RANGES: Record<Range, string> = { today: "Today", yesterday: "Yesterday", week: "Last 7 days", month: "This month", custom: "Pick dates…" };

function rangeOf(from: string, to: string, today: string): Range {
  if (from === today && to === today) return "today";
  const y = addDays(today, -1);
  if (from === y && to === y) return "yesterday";
  if (from === addDays(today, -6) && to === today) return "week";
  if (from === `${today.slice(0, 8)}01` && to === today) return "month";
  return "custom";
}

function datesOf(r: Range, today: string): [string, string] | null {
  if (r === "today") return [today, today];
  if (r === "yesterday") return [addDays(today, -1), addDays(today, -1)];
  if (r === "week") return [addDays(today, -6), today];
  if (r === "month") return [`${today.slice(0, 8)}01`, today];
  return null;
}

/**
 * Orders & receipts filters (R201): receipt search, dates, counter and who in one row, then status chips.
 * Each change reloads the list; the filters live in the address so a link or a download keeps them.
 */
export function OrderFilters({ values, today, people, statuses, methods, outlets }: {
  values: Values; today: string; people: { id: string; name: string }[] | null;
  statuses: Record<string, string>; methods: Record<string, string>; outlets: Record<string, string>;
}) {
  const router = useRouter();
  const path = usePathname();
  const [, start] = useTransition();
  const [range, setRange] = useState<Range>(rangeOf(values.from, values.to, today));
  const [q, setQ] = useState(values.q ?? "");

  const go = (patch: Partial<Values>) => {
    const v = { ...values, q: q || undefined, ...patch };
    const sp = new URLSearchParams();
    if (v.from) sp.set("from", v.from);
    if (v.to) sp.set("to", v.to);
    if (v.method) sp.set("method", v.method);
    if (v.status) sp.set("status", v.status);
    if (v.outlet) sp.set("outlet", v.outlet);
    if (v.staffId) sp.set("staff", v.staffId);
    if (v.q) sp.set("q", v.q);
    start(() => router.replace(`${path}?${sp.toString()}`));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2.5">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || undefined });
          }}
        >
          <label htmlFor="order-q" className="sr-only">Receipt, order number or item</label>
          <Input id="order-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== (values.q ?? "") && go({ q: q.trim() || undefined })} placeholder="Receipt number" className="w-56" maxLength={60} />
        </form>
        <Select
          aria-label="Dates"
          value={range}
          onChange={(e) => {
            const r = e.target.value as Range;
            setRange(r);
            const d = datesOf(r, today);
            if (d) go({ from: d[0], to: d[1] });
          }}
          className="w-40"
        >
          {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {range === "custom" ? (
          <>
            <Input type="date" aria-label="From" defaultValue={values.from} max={today} onChange={(e) => e.target.value && go({ from: e.target.value, to: values.to < e.target.value ? e.target.value : values.to })} className="w-40" />
            <Input type="date" aria-label="To" defaultValue={values.to} max={today} onChange={(e) => e.target.value && go({ to: e.target.value })} className="w-40" />
          </>
        ) : null}
        <Select aria-label="Counter" value={values.outlet ?? ""} onChange={(e) => go({ outlet: e.target.value || undefined })} className="w-44">
          <option value="">Both counters</option>
          {Object.entries(outlets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {people ? (
          <Select aria-label="Sold by" value={values.staffId ?? ""} onChange={(e) => go({ staffId: e.target.value || undefined })} className="w-44">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        ) : null}
        <Select aria-label="Method" value={values.method ?? ""} onChange={(e) => go({ method: e.target.value || undefined })} className="w-44">
          <option value="">Any method</option>
          {Object.entries(methods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
        {Object.entries(statuses).map(([k, v]) => (
          <Chip key={k} on={values.status === k} onClick={() => go({ status: values.status === k ? undefined : k })}>{v}</Chip>
        ))}
      </div>
    </div>
  );
}
