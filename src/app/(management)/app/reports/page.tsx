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
import { reportRange, type Bucket, type ReportRange } from "@/server/domain/reports";
import { activityPageData, moneyPageData, occupancyPageData } from "@/server/queries/reports";

export const metadata: Metadata = { title: "Reports" };

type Tab = "money" | "occupancy" | "activity";
type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const rangeLabel: Record<ReportRange, string> = { today: "Today", "14d": "14 days", month: "This month" };
const bucketLabel: Record<Bucket, string> = { cash: "cash", transfer: "transfer", cardOnline: "card online", pos: "POS card", other: "other" };

function RangeControl({ tab, range }: { tab: Tab; range: ReportRange }) {
  return (
    <nav aria-label="Period" className="flex overflow-hidden rounded-md border border-hairline [&>*+*]:border-l [&>*+*]:border-hairline sm:max-w-sm">
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
          {rangeLabel[r]}
        </Link>
      ))}
    </nav>
  );
}

function Bars({ items, label, format, scaleTo }: { items: { day: string; value: number }[]; label: string; format: (v: number) => string; scaleTo?: number }) {
  const max = scaleTo ?? Math.max(1, ...items.map((d) => d.value));
  return (
    <>
      <div className="flex h-44 items-end gap-1 px-5 pt-4 pb-2" role="img" aria-label={label}>
        {items.map((d) => (
          <div key={d.day} className="group relative min-w-0 flex-1" title={`${formatDate(d.day, { year: false })}: ${format(d.value)}`}>
            <div className="rounded-t bg-navy-700 transition-colors group-hover:bg-gold-500" style={{ height: `${Math.max(2, (d.value / max) * 140)}px` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between px-5 pb-4 text-xs text-ink-500">
        <span>{formatDate(items[0]!.day, { year: false })}</span>
        <span>Today</span>
      </div>
    </>
  );
}

async function Money({ range }: { range: ReportRange }) {
  const { money, cash, finance } = await moneyPageData(range);
  const line = (label: string, kobo: number, strong = false) => (
    <div className={cn("flex justify-between gap-4 py-2", strong && "border-t border-hairline pt-3 font-semibold text-ink-900")}>
      <dt className={strong ? "" : "text-ink-600"}>{label}</dt>
      <dd className="tabular-nums">{formatNaira(kobo)}</dd>
    </div>
  );
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Income and expenses" description={`${rangeLabel[range]} · all departments`} />
        <dl className="grid gap-x-10 px-5 pb-5 text-sm md:grid-cols-2">
          <div>
            {line("Rooms", finance.income.rooms)}
            {line("Restaurant & bar", finance.income.restaurantBar)}
            {line("Conference hall", finance.income.hall)}
            {line("Total income", finance.incomeTotal, true)}
          </div>
          <div>
            {line("Expenses", finance.expensesKobo)}
            {line(`VAT included in income (${finance.vatRateBp / 100}%)`, finance.vatKobo)}
            {line("Income after expenses", finance.netKobo, true)}
          </div>
        </dl>
      </Card>
      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-ink-500">Received · {rangeLabel[range].toLowerCase()}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-ink-900">{formatNaira(money.total)}</p>
            <p className="mt-1 text-xs text-ink-500">Verified payments minus corrections, by the day they were paid (Lagos time).</p>
          </div>
          <a href={`/app/reports/payments-csv?range=${range}`} className={buttonStyles({ variant: "secondary", className: "w-full sm:w-auto" })}>
            <Download className="size-4" aria-hidden /> Download CSV
          </a>
        </div>
        {money.daily.length > 1 ? (
          <div className="border-t border-hairline">
            <Bars items={money.daily.map((d) => ({ day: d.day, value: d.kobo }))} label="Bar chart of money received per day" format={formatNaira} />
          </div>
        ) : null}
      </Card>
      <Card>
        <CardHeader title="Cash-up by staff · today" description="Who took which payments today, for balancing the till." />
        {cash.length === 0 ? (
          <div className="p-5"><EmptyState title="No payments today yet" /></div>
        ) : (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {cash.map((c) => (
              <li key={c.staffId ?? c.who} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="min-w-0">
                  <span className="block font-medium text-ink-900">{c.who}</span>
                  <span className="block truncate text-sm text-ink-500">
                    {(Object.entries(c.counts) as [Bucket, number][]).filter(([, n]) => n > 0).map(([b, n]) => `${n} ${bucketLabel[b]}`).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-base font-semibold tabular-nums text-ink-900">{formatNaira(c.totalKobo)}</span>
              </li>
            ))}
          </ul>
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
          <p className="text-sm text-ink-500">Average occupancy · {rangeLabel[range].toLowerCase()}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-ink-900">{o.averagePct}%</p>
          <p className="mt-1 text-xs text-ink-500">Rooms with a guest each night, out of {plural(o.roomsInService, "room")} in service today.</p>
        </div>
        {o.nights.length > 1 ? (
          <div className="border-t border-hairline">
            <Bars items={o.nights.map((n) => ({ day: n.day, value: n.pct }))} label="Bar chart of occupancy per night" format={(v) => `${v}%`} scaleTo={100} />
          </div>
        ) : null}
      </Card>
      <Card>
        <CardHeader title="Room-nights sold by type" description="Counted by the room each guest actually stayed in." />
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
      <PageHeader title="Reports" description="Money, occupancy and the activity log. All times are Lagos time." />
      <Suspense fallback={<LoadingState />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
