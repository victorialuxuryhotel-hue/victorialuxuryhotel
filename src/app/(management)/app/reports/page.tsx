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
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { Kpi } from "@/components/ui/choice";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { requireStaff } from "@/server/auth";
import { rangeLabel, recentMonths, reportDepartment, reportRange, type Bucket, type Department, type ReportRange } from "@/server/domain/reports";
import { activityPageData, moneyPageData, occupancyPageData } from "@/server/queries/reports";

export const metadata: Metadata = { title: "Reports" };

type Tab = "money" | "occupancy" | "activity";
type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
const fixedLabel = { today: "Today", "14d": "14 days", month: "This month" } as const;
const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const rangeName = (r: ReportRange) => rangeLabel(r);
const METHODS: [Bucket, string][] = [["cash", "Cash"], ["transfer", "Transfer"], ["pos", "POS / card"], ["cardOnline", "Card online"], ["other", "Other"]];

const DEPARTMENTS: [Department | null, string][] = [[null, "All departments"], ["rooms", "Rooms"], ["restaurant", "Restaurant"], ["bar", "Bar"], ["hall", "Conference hall"]];
const deptQuery = (d: Department | null) => (d ? `&dept=${d}` : "");

/** Link tabs: Money | Occupancy | Activity (each its own address). */
function ReportTabs({ items }: { items: { label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label="Reports" className="mx-4 mt-4 flex gap-6 overflow-x-auto border-b border-hairline lg:mx-8">
      {items.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn("-mb-px shrink-0 border-b-[3px] px-0.5 pb-2.5 text-[15px] font-semibold whitespace-nowrap", t.active ? "border-navy-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The period as a segmented control (design R303), an earlier month, the department and Export to Excel in
 * one row. The periods are links so a report can be shared.
 */
function Controls({ tab, range, dept, hotelOnly }: { tab: Tab; range: ReportRange; dept: Department | null; hotelOnly: boolean }) {
  const months = recentMonths(hotelToday()).slice(1);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Period" className="flex w-fit gap-1 rounded-lg bg-[#eae7df] p-1">
        {(["today", "14d", "month"] as const).map((r) => (
          <Link
            key={r}
            href={`/app/reports?tab=${tab}&range=${r}${deptQuery(dept)}`}
            aria-current={r === range ? "page" : undefined}
            className={cn("flex h-10 items-center whitespace-nowrap rounded-md px-5 text-[15px] font-semibold", r === range ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-ink-600 hover:text-ink-900")}
          >
            {fixedLabel[r]}
          </Link>
        ))}
      </nav>
      {months.length ? (
        <form action="/app/reports">
          <input type="hidden" name="tab" value={tab} />
          {dept ? <input type="hidden" name="dept" value={dept} /> : null}
          <AutoSubmitSelect name="range" defaultValue={months.includes(range) ? range : ""} aria-label="Earlier month" className="w-48">
            <option value="" disabled>Earlier month…</option>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </AutoSubmitSelect>
        </form>
      ) : null}
      <span className="flex-1" />
      {tab === "money" && !hotelOnly ? (
        <form action="/app/reports">
          <input type="hidden" name="tab" value="money" />
          <input type="hidden" name="range" value={range} />
          <AutoSubmitSelect name="dept" defaultValue={dept ?? ""} aria-label="Department" className="w-48">
            {DEPARTMENTS.map(([d, label]) => <option key={label} value={d ?? ""}>{label}</option>)}
          </AutoSubmitSelect>
        </form>
      ) : null}
      {tab === "money" ? (
        <a href={`/app/reports/income-csv?range=${range}${deptQuery(dept)}&format=xlsx`} className={buttonStyles({ variant: "secondary" })}>Export to Excel</a>
      ) : null}
    </div>
  );
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-clip rounded-xl border border-hairline bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
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

async function Money({ range, dept }: { range: ReportRange; dept: Department | null }) {
  const [{ income, finance }, o] = await Promise.all([moneyPageData(range, dept), occupancyPageData(range)]);
  const mine = dept ? finance.departments.find((d) => d.key === dept)! : null;
  const deptName = dept ? DEPARTMENTS.find(([d]) => d === dept)![1] : "All departments";
  const received = mine ? mine.incomeKobo : finance.incomeTotal;
  // Average rate and RevPAR need room revenue earned per night, which the reports don't work out yet; money
  // received includes advance payments for later stays, so dividing it by nights would mislead.
  const roomsKobo = finance.departments.find((d) => d.key === "rooms")?.incomeKobo ?? 0;
  const sold = o.nights.reduce((s, n) => s + n.occupied, 0);
  const available = o.nights.length * o.roomsInService;
  const cell = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";
  const days = [...income.daily].reverse().filter((d) => d.total !== 0 || d.day === hotelToday());
  const byMethod = METHODS.map(([b, label]) => [label, income.byStaff.reduce((s, t) => s + (t.byMethod[b] ?? 0), 0)] as const).filter(([, k]) => k !== 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Received" value={formatNaira(received)} note={`${deptName.toLowerCase()}${finance.vatRateBp ? ` · VAT ${formatNaira(mine ? mine.vatKobo : finance.vatKobo)} included` : ""}`} />
        <Kpi label="Occupancy" value={`${o.averagePct}%`} note="room-nights sold ÷ available" />
        <Kpi label="Room-nights sold" value={sold.toLocaleString("en-NG")} note={`of ${available.toLocaleString("en-NG")} available`} />
        <Kpi label="Rooms received" value={formatNaira(roomsKobo)} note="money in for rooms, including advance payments" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Income by day" description={`Money received each day${dept ? "" : ", by department"}. Days with nothing received are left out.`}>
          <div className="relative overflow-x-auto">
            <table className={cn("w-full text-sm", dept ? "" : "min-w-[36rem]")}>
              <thead>
                <tr className="border-b border-hairline text-[13px] text-ink-500">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Day</th>
                  {dept ? null : (
                    <>
                      <th scope="col" className={cn(cell, "font-medium")}>Rooms</th>
                      <th scope="col" className={cn(cell, "font-medium")}>Restaurant</th>
                      <th scope="col" className={cn(cell, "font-medium")}>Bar</th>
                      <th scope="col" className={cn(cell, "font-medium")}>Hall</th>
                    </>
                  )}
                  <th scope="col" className={cn(cell, "font-medium")}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {days.map((d) => (
                  <tr key={d.day}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink-900">{shortDay(d.day)}</th>
                    {dept ? null : (
                      <>
                        <td className={cn(cell, "font-semibold text-ink-900")}>{d.rooms ? formatNaira(d.rooms) : "—"}</td>
                        <td className={cn(cell, "font-semibold text-ink-900")}>{d.restaurant ? formatNaira(d.restaurant) : "—"}</td>
                        <td className={cn(cell, "font-semibold text-ink-900")}>{d.bar ? formatNaira(d.bar) : "—"}</td>
                        <td className={cn(cell, "font-semibold text-ink-900")}>{d.hall ? formatNaira(d.hall) : "—"}</td>
                      </>
                    )}
                    <td className={cn(cell, "font-bold text-ink-900")}>{formatNaira(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="By method">
          {byMethod.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-[13px] text-ink-500">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Method</th>
                  <th scope="col" className={cn(cell, "font-medium")}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {byMethod.map(([label, k]) => (
                  <tr key={label}><th scope="row" className="px-4 py-2.5 text-left font-normal text-ink-900">{label}</th><td className={cn(cell, "font-bold text-ink-900")}>{formatNaira(k)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-4 py-4 text-sm text-ink-500">No money taken in this period.</p>}
        </Panel>
      </div>

      {mine ? null : (
        <Panel title="By department" description={`${rangeName(range)} · open one to see only its money`}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="border-b border-hairline text-[13px] text-ink-500">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Department</th>
                  {finance.vatRateBp ? <th scope="col" className={cn(cell, "font-medium")}>VAT included ({finance.vatRateBp / 100}%)</th> : null}
                  <th scope="col" className={cn(cell, "font-medium")}>Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {finance.departments.map((d) => (
                  <tr key={d.key}>
                    <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink-900">
                      <Link href={`/app/reports?tab=money&range=${range}&dept=${d.key}`} className="hover:underline">{d.label}</Link>
                    </th>
                    {finance.vatRateBp ? <td className={cn(cell, "text-ink-700")}>{formatNaira(d.vatKobo)}</td> : null}
                    <td className={cn(cell, "font-bold text-ink-900")}>{formatNaira(d.incomeKobo)}</td>
                  </tr>
                ))}
                <tr className="bg-ivory-50">
                  <th scope="row" className="px-4 py-2.5 text-left font-bold text-ink-900">Total received</th>
                  {finance.vatRateBp ? <td className={cn(cell, "font-semibold text-ink-900")}>{formatNaira(finance.vatKobo)}</td> : null}
                  <td className={cn(cell, "font-bold text-ink-900")}>{formatNaira(finance.incomeTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Takings by staff and method"
        description={`${rangeName(range)} · ${deptName.toLowerCase()} · money each person took`}
        action={<a href={`/app/reports/income-csv?range=${range}${deptQuery(dept)}`} className={buttonStyles({ variant: "ghost", size: "sm" })}><Download className="size-4" aria-hidden /> Income (CSV)</a>}
      >
        {income.byStaff.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-500">No money taken in this period.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-hairline text-[13px] text-ink-500">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Taken by</th>
                  {METHODS.map(([, label]) => <th key={label} scope="col" className={cn(cell, "font-medium")}>{label}</th>)}
                  <th scope="col" className={cn(cell, "font-medium")}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {income.byStaff.map((t) => (
                  <tr key={t.staffId ?? t.who}>
                    <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink-900">{t.who}</th>
                    {METHODS.map(([b]) => <td key={b} className={cn(cell, t.byMethod[b] ? "text-ink-900" : "text-ink-400")}>{t.byMethod[b] ? formatNaira(t.byMethod[b]) : "–"}</td>)}
                    <td className={cn(cell, "font-bold text-ink-900")}>{formatNaira(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
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
  if (!canAny(staff.role, ["reports.view", "reports.hotel"])) return <AccessDenied />;
  const hotelOnly = !can(staff.role, "reports.view");
  const sp = await searchParams;
  const tab: Tab = str(sp.tab) === "occupancy" ? "occupancy" : str(sp.tab) === "activity" ? "activity" : "money";
  const range = reportRange(str(sp.range));
  const dept = tab === "money" ? (hotelOnly ? "rooms" : reportDepartment(str(sp.dept))) : null;
  return (
    <>
      <PageHeader title="Reports" description="Money, occupancy and staff activity" />
      <ReportTabs
        items={[
          { label: "Money", href: `/app/reports?tab=money&range=${range}`, active: tab === "money" },
          { label: "Occupancy", href: `/app/reports?tab=occupancy&range=${range}`, active: tab === "occupancy" },
          ...(can(staff.role, "activity.view") ? [{ label: "Activity", href: "/app/reports?tab=activity", active: tab === "activity" }] : []),
        ]}
      />
      <div className="space-y-4 px-4 py-4 lg:px-8">
        {tab === "activity" ? (
          can(staff.role, "activity.view") ? (
            <Activity sp={sp} />
          ) : (
            <AccessDenied />
          )
        ) : (
          <>
            <Controls tab={tab} range={range} dept={dept} hotelOnly={hotelOnly} />
            {tab === "money" ? <Money range={range} dept={dept} /> : <Occupancy range={range} />}
          </>
        )}
      </div>
    </>
  );
}

export default function ReportsPage(props: PageProps<"/app/reports">) {
  return (
    <Suspense fallback={<><PageHeader title="Reports" description="Money, occupancy and staff activity" /><LoadingState /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
