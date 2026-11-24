import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatNaira } from "@/lib/format";
import { hotelToday } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { MENU_CATEGORIES, OUTLETS, PAY_METHODS, type Outlet, type PayMethod } from "@/server/domain/pos";
import { posReport, type PosRange } from "@/server/domain/pos-reports";
import { recentMonths, reportRange } from "@/server/domain/reports";

export const metadata: Metadata = { title: "Sales reports" };

const FIXED = { today: "Today", "7d": "7 days", month: "This month" } as const;
const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const chip = (on: boolean) => cn("inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap", on ? "border-navy-800 bg-navy-800 text-white" : "border-ink-300 bg-ivory-50 text-ink-700 hover:bg-ink-900/5");

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="px-5 py-4 text-sm text-ink-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-ink-500">
          <tr className="border-b border-hairline">
            {head.map((h, i) => <th key={h} scope="col" className={cn("px-5 py-2.5 font-medium", i ? "text-right" : "text-left")}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={cn("px-5 py-2.5", j ? "text-right tabular-nums whitespace-nowrap" : "text-ink-900")}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "pos.view")) return <AccessDenied />;
  const reader = await authorizeRead("pos.view");
  const sp = await searchParams;
  const range: PosRange = reportRange(str(sp.range));
  const outlet = str(sp.outlet) === "restaurant" || str(sp.outlet) === "bar" ? (str(sp.outlet) as Outlet) : null;
  const r = await posReport(await getDb(), actorOf(reader), range, outlet);
  const q = (over: Record<string, string | null>) => {
    const p = new URLSearchParams({ range, ...(outlet ? { outlet } : {}) });
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/app/sales/reports?${p}`;
  };
  const rangeName = range in FIXED ? FIXED[range as keyof typeof FIXED] : monthName(range);
  const months = recentMonths(hotelToday()).slice(1);
  const days = [...r.daily].reverse().filter((d) => d.kobo || d.day === hotelToday());
  const stat = (label: string, value: string, sub?: string, bad = false) => (
    <div className="rounded-card border border-hairline bg-ivory-50 p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={cn("mt-1 font-display text-2xl tabular-nums", bad ? "text-danger-700" : "text-navy-950")}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <div className="space-y-3">
        <nav aria-label="Counter" className="flex flex-wrap gap-2">
          {([null, "restaurant", "bar"] as const).map((o) => (
            <Link key={o ?? "all"} href={q({ outlet: o })} aria-current={o === outlet ? "page" : undefined} className={chip(o === outlet)}>{o ? OUTLETS[o] : "Restaurant and bar"}</Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(FIXED) as (keyof typeof FIXED)[]).map((k) => (
            <Link key={k} href={q({ range: k })} aria-current={k === range ? "page" : undefined} className={chip(k === range)}>{FIXED[k]}</Link>
          ))}
          {months.length ? (
            <form action="/app/sales/reports" className="flex gap-2">
              {outlet ? <input type="hidden" name="outlet" value={outlet} /> : null}
              <select name="range" defaultValue={months.includes(range) ? range : ""} aria-label="Earlier month" className="min-h-10 rounded-md border border-hairline bg-ivory-50 px-3 text-sm">
                <option value="" disabled>Earlier month</option>
                {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              </select>
              <button type="submit" className={buttonStyles({ variant: "secondary", size: "sm" })}>Show</button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stat("Sales", formatNaira(r.salesKobo), `${r.sales} completed · ${rangeName.toLowerCase()}`)}
        {stat("Expenses", formatNaira(r.expensesKobo))}
        {stat("After expenses", formatNaira(r.netKobo), undefined, r.netKobo < 0)}
        {stat("Voided", formatNaira(r.voidsKobo), `${r.voids} sale${r.voids === 1 ? "" : "s"}`)}
        {stat("Closing differences", formatNaira(Math.abs(r.closings.diff)), `${r.closings.diff < 0 ? "short" : r.closings.diff > 0 ? "over" : "none"} · ${r.closings.unverified} not signed off`, r.closings.diff !== 0)}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={`/app/sales/orders/csv?from=${r.from}&to=${r.to}${outlet ? `&outlet=${outlet}` : ""}`} className={buttonStyles({ variant: "secondary", size: "sm" })}><Download className="size-4" aria-hidden /> Orders (CSV)</a>
        <a href={`/app/sales/reports/items-csv?range=${range}${outlet ? `&outlet=${outlet}` : ""}`} className={buttonStyles({ variant: "secondary", size: "sm" })}><Download className="size-4" aria-hidden /> Sales by item (CSV)</a>
        <a href={`/app/sales/reports/stock-csv?range=${range}`} className={buttonStyles({ variant: "secondary", size: "sm" })}><Download className="size-4" aria-hidden /> Stock (CSV)</a>
        <a href={`/app/reports/expenses-csv?range=${range}${outlet ? `&dept=${outlet}` : ""}`} className={buttonStyles({ variant: "secondary", size: "sm" })}><Download className="size-4" aria-hidden /> Expenses (CSV)</a>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Sales by day" />
          <Table head={["Day", "Sales", "Amount"]} rows={days.map((d) => [formatDate(d.day, { year: false }), d.n, formatNaira(d.kobo)])} empty="No sales." />
        </Card>
        <Card>
          <CardHeader title="By payment method" />
          <Table head={["Method", "Amount"]} rows={(Object.keys(PAY_METHODS) as PayMethod[]).map((m) => [PAY_METHODS[m], formatNaira(r.byMethod[m])])} empty="No sales." />
        </Card>
        <Card>
          <CardHeader title="By attendant" />
          <Table head={["Attendant", "Sales", "Amount"]} rows={r.byStaff.map((s) => [s.who, s.n, formatNaira(s.kobo)])} empty="No sales." />
        </Card>
        <Card>
          <CardHeader title="By category" />
          <Table head={["Category", "Qty", "Amount"]} rows={r.byCategory.map((c) => [MENU_CATEGORIES[c.category] ?? c.category, c.qty, formatNaira(c.kobo)])} empty="No sales." />
        </Card>
      </div>

      <Card>
        <CardHeader title="By menu item" description="Best sellers first." />
        <Table head={["Item", "Counter", "Qty", "Amount"]} rows={r.byItem.map((i) => [i.name, OUTLETS[i.outlet], i.qty, formatNaira(i.kobo)])} empty="No sales." />
      </Card>

      <Card>
        <CardHeader title="Stock" description={`Now, and what moved · ${rangeName.toLowerCase()}`} action={<Link href="/app/stock" className="text-sm font-medium text-navy-800 hover:underline">Open stock</Link>} />
        {r.stock.length ? (
          <Table
            head={["Item", "In stock", "Received", "Sold", "Used", "Wasted", "Returned"]}
            rows={r.stock.map((s) => {
              const m = r.stockMoves.find((x) => x.name === s.name);
              const low = s.quantity <= s.min_quantity;
              return [`${s.name}${low ? " · low" : ""}`, `${s.quantity} ${s.unit}`, m?.received ?? 0, m?.sold ?? 0, m?.used ?? 0, m?.wasted ?? 0, m?.returned ?? 0];
            })}
            empty=""
          />
        ) : (
          <div className="p-5"><EmptyState title="No stock items yet" /></div>
        )}
      </Card>
    </div>
  );
}

export default function SalesReportsPage(props: PageProps<"/app/sales/reports">) {
  return (
    <>
      <PageHeader title="Sales reports" description="Restaurant & bar sales, stock and money." />
      <Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense>
    </>
  );
}
