import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { ActivityLog } from "@/components/management/activity-log";
import { activityCategory } from "@/server/domain/activity";
import { hotelToday } from "@/lib/hotel-date";
import { pageFrom } from "@/components/management/pager";
import { Tabs } from "@/components/management/toolbar";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { requireStaff } from "@/server/auth";
import { recentMonths, reportRange, type Bucket, type ReportRange } from "@/server/domain/reports";
import { activityPageData, moneyPageData, occupancyPageData } from "@/server/queries/reports";

export const metadata: Metadata = { title: "Reports" };

type Tab = "money" | "occupancy" | "activity";
type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const fixedLabel = { today: "Today", "14d": "14 days", month: "This month" } as const;
const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const rangeName = (r: ReportRange) => (r in fixedLabel ? fixedLabel[r as keyof typeof fixedLabel] : monthName(r));
const METHODS: [Bucket, string][] = [["cash", "Cash"], ["transfer", "Transfer"], ["pos", "POS / card"], ["cardOnline", "Card online"], ["other", "Other"]];

function RangeControl({ tab, range }: { tab: Tab; range: ReportRange }) {
  const months = recentMonths(hotelToday()).slice(1);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <nav aria-label="Period" className="flex overflow-hidden rounded-md border border-hairline [&>*+*]:border-l [&>*+*]:border-hairline sm:w-96">
        {(["today", "14d", "month"] as const).map((r) => (
          <Link
            key={r}
            href={`/app/reports?tab=${tab}&range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center px-2 text-sm",
              r === range ? "text-navy-800 shadow-[inset_0_0_0_1px_var(--color-navy-800)]" : "text-ink-900 hover:bg-ink-900/7",
            )}
          >
            {fixedLabel[r]}
          </Link>
        ))}
      </nav>
      {months.length ? (
        <form action="/app/reports" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <label htmlFor="month" className="sr-only">Earlier month</label>
          <select id="month" name="range" defaultValue={months.includes(range) ? range : ""} className="min-h-11 rounded-md border border-hairline bg-ivory-50 px-3 text-sm">
            <option value="" disabled>Earlier month</option>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          <button type="submit" className={buttonStyles({ variant: "secondary" })}>Show</button>
        </form>
      ) : null}
    </div>
  );
}

function Bars({ items, label, format, scaleTo }: { items: { day: string; value: number }[]; label: string; format: (v: number) => string; scaleTo?: number }) {
  const max = scaleTo ?? Math.max(1, ...items.map((d) => d.value));
  const last = items[items.length - 1]!.day;
  return (
    <>
      <div className="flex h-44 items-end gap-1 px-5 pt-4 pb-2" role="img" aria-label={label}>
        {items.map((d) => (
          <div key={d.day} className="group relative min-w-0 flex-1" title={`${formatDate(d.day, { year: false })}: ${format(d.value)}`}>
            <div className="rounded-t bg-navy-700 transition-colors group-hover:bg-gold-500" style={{ height: `${Math.max(2, (Math.max(0, d.value) / max) * 140)}px` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between px-5 pb-4 text-xs text-ink-500">
        <span>{formatDate(items[0]!.day, { year: false })}</span>
        <span>{last === hotelToday() ? "Today" : formatDate(last, { year: false })}</span>
      </div>
    </>
  );
}

async function Money({ range }: { range: ReportRange }) {
  const { income, finance } = await moneyPageData(range);
  const line = (label: string, kobo: number, strong = false) => (
    <div className={cn("flex justify-between gap-4 py-2", strong && "border-t border-hairline pt-3 font-semibold text-ink-900")}>
      <dt className={strong ? "" : "text-ink-600"}>{label}</dt>
      <dd className="tabular-nums">{formatNaira(kobo)}</dd>
    </div>
  );
  const cell = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
  const days = [...income.daily].reverse().filter((d) => d.total !== 0 || d.day === hotelToday());
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Income and expenses" description={`${rangeName(range)} · all departments`} />
        <dl className="grid gap-x-10 px-5 pb-5 text-sm md:grid-cols-2">
          <div>
            {line("Rooms", finance.income.rooms)}
            {line("Conference hall", finance.income.hall)}
            {line("Total income", finance.incomeTotal, true)}
          </div>
          <div>
            {line("Expenses", finance.expensesKobo)}
            {line(`VAT included in income (${finance.vatRateBp / 100}%)`, finance.vatKobo)}
            {line("Income after expenses", finance.netKobo, true)}
          </div>
        </dl>
        <div className="flex flex-col gap-2 border-t border-hairline px-5 py-4 sm:flex-row">
          <a href={`/app/reports/income-csv?range=${range}`} className={buttonStyles({ variant: "secondary", className: "w-full sm:w-auto" })}>
            <Download className="size-4" aria-hidden /> Income (CSV)
          </a>
          <a href={`/app/reports/expenses-csv?range=${range}`} className={buttonStyles({ variant: "secondary", className: "w-full sm:w-auto" })}>
            <Download className="size-4" aria-hidden /> Expenses (CSV)
          </a>
        </div>
      </Card>

      <Card>
        <CardHeader title="Income by day" description="Money received each day, by department. Days with nothing received are left out." />
        {income.daily.length > 1 ? (
          <div className="border-t border-hairline">
            <Bars items={income.daily.map((d) => ({ day: d.day, value: d.total }))} label="Bar chart of income per day" format={formatNaira} />
          </div>
        ) : null}
        <div className="overflow-x-auto border-t border-hairline">
          <table className="w-full min-w-[24rem] text-sm">
            <thead className="text-xs text-ink-500">
              <tr className="border-b border-hairline">
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Day</th>
                <th scope="col" className={cn(cell, "font-medium")}>Rooms</th>
                <th scope="col" className={cn(cell, "font-medium")}>Hall</th>
                <th scope="col" className={cn(cell, "pr-5 font-medium")}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {days.map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="px-5 py-2.5 text-left font-normal text-ink-700">{formatDate(d.day, { year: false })}</th>
                  <td className={cell}>{formatNaira(d.rooms)}</td>
                  <td className={cell}>{formatNaira(d.hall)}</td>
                  <td className={cn(cell, "pr-5 font-semibold text-ink-900")}>{formatNaira(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Takings by staff and method" description={`${rangeName(range)} · money each person took`} />
        {income.byStaff.length === 0 ? (
          <div className="p-5"><EmptyState title="No money taken in this period" /></div>
        ) : (
          <div className="overflow-x-auto border-t border-hairline">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-xs text-ink-500">
                <tr className="border-b border-hairline">
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">Taken by</th>
                  {METHODS.map(([, label]) => <th key={label} scope="col" className={cn(cell, "font-medium")}>{label}</th>)}
                  <th scope="col" className={cn(cell, "pr-5 font-medium")}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {income.byStaff.map((t) => (
                  <tr key={t.staffId ?? t.who}>
                    <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink-900">{t.who}</th>
                    {METHODS.map(([b]) => <td key={b} className={cn(cell, !t.byMethod[b] && "text-ink-400")}>{t.byMethod[b] ? formatNaira(t.byMethod[b]) : "–"}</td>)}
                    <td className={cn(cell, "pr-5 font-semibold text-ink-900")}>{formatNaira(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function Occupancy({ range }: { range: ReportRange }) {
  const o = await occupancyPageData(range);
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-5">
          <p className="text-sm text-ink-500">Average occupancy · {rangeName(range).toLowerCase()}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-ink-900">{o.averagePct}%</p>
          <p className="mt-1 text-xs text-ink-500">Rooms with a guest each night, out of {plural(o.roomsInService, "room")}.</p>
        </div>
        {o.nights.length > 1 ? (
          <div className="border-t border-hairline">
            <Bars items={o.nights.map((n) => ({ day: n.day, value: n.pct }))} label="Bar chart of occupancy per night" format={(v) => `${v}%`} scaleTo={100} />
          </div>
        ) : null}
      </Card>
      <Card>
        <CardHeader title="Room-nights sold by type" />
        {o.byType.length === 0 ? (
          <div className="p-5"><EmptyState title="No stays in this period" /></div>
        ) : (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {o.byType.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-ink-900">{t.name}</span>
                <span className="tabular-nums text-ink-700">{plural(t.nights, "night")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const ACTIVITY_PAGE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Activity({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const who = str(sp.who);
  const p = {
    range: str(sp.range) ? reportRange(str(sp.range)) : ("today" as const),
    cat: activityCategory(str(sp.cat)),
    who: who && UUID.test(who) ? who : undefined,
    routine: str(sp.routine) === "1",
    page: pageFrom(sp.page),
  };
  const data = await activityPageData({ range: p.range, category: p.cat, actorId: p.who, routine: p.routine, page: p.page, size: ACTIVITY_PAGE });
  return <ActivityLog p={p} rows={data.rows} total={data.total} people={data.people} today={hotelToday()} size={ACTIVITY_PAGE} />;
}

async function Content({ searchParams }: { searchParams: SP }) {
  const staff = await requireStaff();
  if (!can(staff.role, "reports.view")) return <AccessDenied />;
  const sp = await searchParams;
  const tab: Tab = str(sp.tab) === "occupancy" ? "occupancy" : str(sp.tab) === "activity" ? "activity" : "money";
  const range = reportRange(str(sp.range));
  return (
    <>
      <div className="bg-ivory-50">
        <Tabs
          items={[
            { label: "Money", href: `/app/reports?tab=money&range=${range}`, active: tab === "money" },
            { label: "Occupancy", href: `/app/reports?tab=occupancy&range=${range}`, active: tab === "occupancy" },
            ...(can(staff.role, "activity.view") ? [{ label: "Activity log", href: "/app/reports?tab=activity", active: tab === "activity" }] : []),
          ]}
        />
      </div>
      <div className="space-y-5 px-4 py-6 lg:px-8">
        {tab === "activity" ? (
          can(staff.role, "activity.view") ? (
            <Activity sp={sp} />
          ) : (
            <AccessDenied />
          )
        ) : (
          <>
            <RangeControl tab={tab} range={range} />
            {tab === "money" ? <Money range={range} /> : <Occupancy range={range} />}
          </>
        )}
      </div>
    </>
  );
}

export default function ReportsPage(props: PageProps<"/app/reports">) {
  return (
    <>
      <PageHeader title="Reports" description="Money, occupancy and staff activity." />
      <Suspense fallback={<LoadingState />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
