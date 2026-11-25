import Link from "next/link";
import { Check, Download } from "lucide-react";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { ACTIVITY_CATEGORIES, type ActivityCategory, type ActivityEntry } from "@/server/domain/activity";
import type { ReportRange } from "@/server/domain/reports";
import { Pager } from "./pager";

export type ActivityParams = { range: ReportRange; cat: ActivityCategory; who?: string; routine: boolean; page: number };

const rangeLabel: Partial<Record<ReportRange, string>> = { today: "Today", "7d": "7 days", "14d": "14 days", month: "This month" };
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));

export function activityHref(p: ActivityParams, change: Partial<ActivityParams> = {}): string {
  const n = { ...p, page: 1, ...change };
  const q = new URLSearchParams({ tab: "activity" });
  if (n.range !== "today") q.set("range", n.range);
  if (n.cat !== "all") q.set("cat", n.cat);
  if (n.who) q.set("who", n.who);
  if (n.routine) q.set("routine", "1");
  if (n.page > 1) q.set("page", String(n.page));
  return `/app/reports?${q.toString()}`;
}

function dayHeading(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDate(day);
}

export function ActivityLog({ p, rows, total, people, today, size }: {
  p: ActivityParams;
  rows: ActivityEntry[];
  total: number;
  people: Array<{ id: string; name: string }>;
  today: string;
  size: number;
}) {
  const days: Array<{ day: string; items: ActivityEntry[] }> = [];
  for (const r of rows) {
    const last = days.at(-1);
    if (last?.day === r.day) last.items.push(r);
    else days.push({ day: r.day, items: [r] });
  }
  const chip = (c: ActivityCategory, label: string) => {
    const on = p.cat === c;
    return (
      <Link
        key={c}
        href={activityHref(p, { cat: c })}
        aria-current={on ? "true" : undefined}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap",
          on ? "border-navy-800 bg-navy-50 text-navy-800" : "border-hairline text-ink-900 hover:bg-ink-900/7",
        )}
      >
        {on ? <Check className="size-3.5" aria-hidden /> : null}
        {label}
      </Link>
    );
  };
  const csv = new URLSearchParams({ range: p.range, cat: p.cat, ...(p.who ? { who: p.who } : {}), ...(p.routine ? { routine: "1" } : {}) });

  return (
    <div className="space-y-4">
      <nav aria-label="Period" className="flex overflow-hidden rounded-md border border-hairline sm:max-w-sm [&>*+*]:border-l [&>*+*]:border-hairline">
        {(["today", "14d", "month"] as const).map((r) => (
          <Link
            key={r}
            href={activityHref(p, { range: r })}
            aria-current={r === p.range ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center px-2 text-sm",
              r === p.range ? "text-navy-800 shadow-[inset_0_0_0_1px_var(--color-navy-800)]" : "text-ink-900 hover:bg-ink-900/7",
            )}
          >
            {rangeLabel[r]}
          </Link>
        ))}
      </nav>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0" aria-label="Kind of activity">
        {chip("all", "All")}
        {(Object.keys(ACTIVITY_CATEGORIES) as Array<Exclude<ActivityCategory, "all">>).map((c) => chip(c, ACTIVITY_CATEGORIES[c].label))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <form action="/app/reports" className="sm:w-64">
          <input type="hidden" name="tab" value="activity" />
          {p.range !== "today" ? <input type="hidden" name="range" value={p.range} /> : null}
          {p.cat !== "all" ? <input type="hidden" name="cat" value={p.cat} /> : null}
          {p.routine ? <input type="hidden" name="routine" value="1" /> : null}
          <label htmlFor="who" className="mb-1.5 block text-[13px] text-ink-700">Who</label>
          <AutoSubmitSelect id="who" name="who" defaultValue={p.who ?? ""}>
            <option value="">Everyone</option>
            {people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </AutoSubmitSelect>
          <noscript><button type="submit" className={buttonStyles({ variant: "secondary", className: "mt-2" })}>Apply</button></noscript>
        </form>
        <Link
          href={activityHref(p, { routine: !p.routine })}
          role="switch"
          aria-checked={p.routine}
          className="flex min-h-13 items-center justify-between gap-4 border-b border-hairline sm:border-0"
        >
          <span>
            <span className="block text-[15px] text-ink-900">Show routine events</span>
            <span className="block text-xs text-ink-500">{p.routine ? "Including payment attempts, cleaning updates and view-as" : "Payment attempts, cleaning updates and view-as are hidden"}</span>
          </span>
          <span className={cn("relative h-[26px] w-11 shrink-0 rounded-full border-[1.5px]", p.routine ? "border-navy-800 bg-navy-50" : "border-ink-400")}>
            <span className={cn("absolute top-[3px] left-[3px] size-[17px] rounded-full transition-transform", p.routine ? "translate-x-[18px] bg-navy-800" : "bg-ink-400")} />
          </span>
        </Link>
      </div>

      <div className="overflow-clip rounded-card border border-hairline">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={p.cat === "all" && !p.who ? `Nothing logged ${p.range === "today" ? "today" : "in this period"}` : "Nothing matches these filters"}
              description={p.routine ? undefined : "Routine events are hidden. Turn them on to see payment attempts and cleaning updates."}
              action={p.cat !== "all" || p.who ? <Link href={activityHref({ ...p, cat: "all", who: undefined })} className={buttonStyles({ variant: "secondary" })}>Clear filters</Link> : undefined}
            />
          </div>
        ) : (
          days.map((d) => (
            <section key={d.day} aria-labelledby={`day-${d.day}`}>
              <h3 id={`day-${d.day}`} className="border-b border-hairline bg-ivory-100 px-4 py-2 font-sans text-xs font-normal tracking-[0.2em] text-ink-500 uppercase sm:px-5">
                {dayHeading(d.day, today)}
              </h3>
              <ul className="divide-y divide-hairline">
                {d.items.map((a) => (
                  <li key={a.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-3 sm:px-5">
                    <p className="text-[15px] text-ink-900">{a.summary}</p>
                    <p className="text-right text-xs text-ink-500 tabular-nums">{time(a.created_at)}</p>
                    <p className="text-xs text-ink-500">{a.actor ?? (a.actor_type === "system" ? "System" : "Staff")}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <Pager
          basePath="/app/reports"
          params={{ tab: "activity", range: p.range === "today" ? undefined : p.range, cat: p.cat === "all" ? undefined : p.cat, who: p.who, routine: p.routine ? "1" : undefined }}
          page={p.page}
          hasMore={p.page * size < total}
          total={total}
          size={size}
        />
      </div>

      <a href={`/app/reports/activity-csv?${csv.toString()}&format=xlsx`} className={buttonStyles({ variant: "ghost", className: "w-full sm:w-auto" })}>
        <Download className="size-4" aria-hidden /> Download Excel
      </a>
      <a href={`/app/reports/activity-csv?${csv.toString()}`} className={buttonStyles({ variant: "ghost", className: "w-full sm:w-auto" })}>
        <Download className="size-4" aria-hidden /> CSV
      </a>
    </div>
  );
}
