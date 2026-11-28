import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { buttonStyles } from "@/components/ui/button";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { Kpi } from "@/components/ui/choice";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { businessDate } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { MENU_CATEGORIES, OUTLETS, PAY_METHODS, type Outlet, type PayMethod } from "@/server/domain/pos";
import { posReport, type PosRange } from "@/server/domain/pos-reports";
import { rangeLabel, recentMonths, reportRange } from "@/server/domain/reports";

export const metadata: Metadata = { title: "Sales reports" };

const FIXED = { today: "Today", "7d": "7 days", month: "This month" } as const;
const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const shortDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
const METHOD_SHORT: Record<PayMethod, string> = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS" };
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
/** The period links look like a segmented control (design R205); each is a link so the page stays shareable. */
const seg = (on: boolean) => cn("flex h-10 items-center whitespace-nowrap rounded-md px-5 text-[15px] font-semibold", on ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-ink-600 hover:text-ink-900");

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="px-4 py-4 text-sm text-ink-500">{empty}</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-[13px] text-ink-500">
            {head.map((h, i) => <th key={h} scope="col" className={cn("px-4 py-2.5 font-medium", i ? "text-right" : "text-left")}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={cn("px-4 py-2.5", j ? "whitespace-nowrap text-right font-semibold tabular-nums text-ink-900" : "text-ink-900")}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
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
  const rangeName = rangeLabel(range);
  const months = recentMonths(businessDate()).slice(1);
  const days = [...r.daily].reverse().filter((d) => d.kobo || d.day === businessDate());
  const ordersCsv = `/app/sales/orders/csv?from=${r.from}&to=${r.to}${outlet ? `&outlet=${outlet}` : ""}`;
  const average = r.sales ? Math.round(r.salesKobo / r.sales) : 0;
  const diff = r.closings.diff;
  return (
    <>
      <PageHeader title="Sales reports" description="Restaurant and bar sales, stock and money" />
      <div className="space-y-4 px-4 py-5 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Period" className="flex w-fit gap-1 rounded-lg bg-[#eae7df] p-1">
            {(Object.keys(FIXED) as (keyof typeof FIXED)[]).map((k) => (
              <Link key={k} href={q({ range: k })} aria-current={k === range ? "page" : undefined} className={seg(k === range)}>{FIXED[k]}</Link>
            ))}
          </nav>
          {months.length ? (
            <form action="/app/sales/reports">
              {outlet ? <input type="hidden" name="outlet" value={outlet} /> : null}
              <AutoSubmitSelect name="range" defaultValue={months.includes(range) ? range : ""} aria-label="Earlier month" className="w-48">
                <option value="" disabled>Earlier month…</option>
                {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              </AutoSubmitSelect>
            </form>
          ) : null}
          <span className="flex-1" />
          <form action="/app/sales/reports">
            <input type="hidden" name="range" value={range} />
            <AutoSubmitSelect name="outlet" defaultValue={outlet ?? ""} aria-label="Counter" className="w-44">
              <option value="">Both counters</option>
              {(Object.keys(OUTLETS) as Outlet[]).map((o) => <option key={o} value={o}>{OUTLETS[o]}</option>)}
            </AutoSubmitSelect>
          </form>
          <a href={`${ordersCsv}&format=xlsx`} className={buttonStyles({ variant: "secondary" })}>Export to Excel</a>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi label="Sales" value={formatNaira(r.salesKobo)} note={`${r.sales} order${r.sales === 1 ? "" : "s"} · ${rangeName.toLowerCase()}`} />
          <Kpi label="Average order" value={formatNaira(average)} />
          <Kpi label="Voids" value={`${r.voids} · ${formatNaira(r.voidsKobo)}`} note={r.voids ? "voided after payment" : "none"} tone={r.voids ? "danger" : undefined} />
          <Kpi
            label="Cash over/short"
            value={diff === 0 ? formatNaira(0) : `${diff < 0 ? "−" : "+"}${formatNaira(Math.abs(diff))}`}
            note={`${r.closings.n} closing${r.closings.n === 1 ? "" : "s"} · ${r.closings.unverified} to check`}
            tone={diff < 0 ? "warning" : undefined}
          />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Panel title="By day">
            <Table head={["Day", "Orders", "Amount"]} rows={days.map((d) => [shortDay(d.day), d.n, formatNaira(d.kobo)])} empty="No sales." />
          </Panel>
          <Panel title="By method">
            <Table head={["Method", "Amount"]} rows={(Object.keys(PAY_METHODS) as PayMethod[]).map((m) => [METHOD_SHORT[m], formatNaira(r.byMethod[m])])} empty="No sales." />
          </Panel>
          <Panel title="By salesperson">
            <Table head={["Sold by", "Orders", "Amount"]} rows={r.byStaff.map((s) => [s.who, s.n, formatNaira(s.kobo)])} empty="No sales." />
          </Panel>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel title="By category">
            <Table head={["Category", "Qty", "Amount"]} rows={r.byCategory.map((c) => [MENU_CATEGORIES[c.category] ?? c.category, c.qty, formatNaira(c.kobo)])} empty="No sales." />
          </Panel>
          <Panel title="By menu item" description="Best sellers first">
            <Table head={["Item", "Counter", "Qty", "Amount"]} rows={r.byItem.map((i) => [i.name, OUTLETS[i.outlet], i.qty, formatNaira(i.kobo)])} empty="No sales." />
          </Panel>
        </div>

        <Panel
          title="Transfers and POS payments to check"
          description={`Every transfer and POS/card sale, by salesperson, with the reference they entered. Tick transfers off against the bank statement and POS slips against the terminal's report · ${rangeName.toLowerCase()}`}
        >
        <Table
          head={["Sold by", "Time", "Receipt", "Counter", "Method", "Amount", "Reference"]}
          rows={r.transfers.map((t) => [
            t.who, formatDateTime(t.paid_at), t.receipt_number, OUTLETS[t.outlet], PAY_METHODS[t.method], formatNaira(t.kobo),
            t.reference ? (t.method === "pos_terminal" ? `Slip …${t.reference}` : t.reference) : "None (before references were required)",
          ])}
          empty="No transfer or POS sales."
        />
        </Panel>

        <Panel title="Unpaid orders cancelled" description={`Who cancelled what, and why · ${rangeName.toLowerCase()}`}>
        <Table
          head={["Cancelled by", "Time", "Order", "Counter", "Amount", "Reason"]}
          rows={r.cancelled.map((c) => [c.who, formatDateTime(c.closed_at), `#${c.number}`, OUTLETS[c.outlet], formatNaira(c.kobo), c.reason ?? "None given (before reasons were required)"])}
          empty="No orders cancelled."
        />
        </Panel>

        <Panel title="Stock" description={`Now, and what moved · ${rangeName.toLowerCase()}`} action={<Link href="/app/stock" className={buttonStyles({ variant: "ghost", size: "sm" })}>Open stock</Link>}>
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
          <p className="px-4 py-4 text-sm text-ink-500">No stock items yet.</p>
        )}
        </Panel>

        <Panel title="Downloads" description={`For the accountant · ${rangeName.toLowerCase()}`}>
          <div className="flex flex-wrap gap-2 p-4">
            {[
              ["Orders", ordersCsv],
              ["Sales by item", `/app/sales/reports/items-csv?range=${range}${outlet ? `&outlet=${outlet}` : ""}`],
              ["Stock", `/app/sales/reports/stock-csv?range=${range}`],
              ["Transfers and POS", `/app/sales/reports/transfers-csv?range=${range}${outlet ? `&outlet=${outlet}` : ""}`],
            ].map(([label, href]) => (
              <span key={label} className="inline-flex">
                <a href={`${href}&format=xlsx`} className={buttonStyles({ variant: "secondary", size: "sm" })}><Download className="size-4" aria-hidden /> {label} (Excel)</a>
                <a href={href} className={buttonStyles({ variant: "ghost", size: "sm" })} aria-label={`${label} as CSV`}>CSV</a>
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

export default function SalesReportsPage(props: PageProps<"/app/sales/reports">) {
  return (
    <Suspense fallback={<><PageHeader title="Sales reports" description="Restaurant and bar sales, stock and money" /><LoadingState /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
