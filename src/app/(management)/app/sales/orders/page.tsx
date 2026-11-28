import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/feedback";
import { OrderFilters } from "@/components/management/order-filters";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { businessDate } from "@/lib/hotel-date";

const businessDateOf = (iso: string) => businessDate(new Date(iso));
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { all, getDb } from "@/server/db";
import { listOrders, OUTLETS, PAY_METHODS, type OrderStatus, type PayMethod } from "@/server/domain/pos";
import { orderFilters } from "@/server/pos-filters";

export const metadata: Metadata = { title: "Orders & receipts" };

const LIMIT = 200;

const tone: Record<OrderStatus, Tone> = { open: "warning", paid: "success", cancelled: "neutral", void: "danger" };
/** In the order the chips show (design R201). */
const STATUS_LABEL: Record<OrderStatus, string> = { paid: "Paid", open: "Open", void: "Voided", cancelled: "Cancelled" };
const METHOD_SHORT: Record<PayMethod, string> = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS" };
const shortDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["pos.sell", "pos.view"])) return <AccessDenied />;
  const reader = await authorizeRead(["pos.sell", "pos.view"]);
  const db = await getDb();
  const sp = await searchParams;
  const f = orderFilters(sp);
  const viewer = can(staff.role, "pos.view");
  const [orders, people] = await Promise.all([
    listOrders(db, actorOf(reader), f, LIMIT),
    viewer
      ? all<{ id: string; name: string }>(db, "SELECT DISTINCT s.id, s.full_name AS name FROM pos_orders o JOIN staff_profiles s ON s.id = coalesce(o.paid_by, o.created_by) ORDER BY s.full_name")
      : Promise.resolve([]),
  ]);
  const paid = orders.filter((o) => o.status === "paid");
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const today = businessDate();
  const period = f.from === today && f.to === today ? "today" : f.from === f.to ? `on ${shortDay(f.from)}` : `${shortDay(f.from)} to ${shortDay(f.to)}`;
  return (
    <>
      <PageHeader
        title="Orders & receipts"
        description="Every order. Open one to see or reprint its receipt"
        actions={viewer ? (
          <>
            <a href={`/app/sales/orders/csv?${query}&format=xlsx`} className={buttonStyles({ variant: "secondary" })}><Download className="size-4" aria-hidden /> Download (Excel)</a>
            <a href={`/app/sales/orders/csv?${query}`} className={buttonStyles({ variant: "ghost" })}>CSV</a>
          </>
        ) : null}
      />
      <div className="space-y-4 px-4 py-5 lg:px-8">
        <OrderFilters
          values={{ ...f }}
          today={today}
          people={viewer ? people : null}
          statuses={STATUS_LABEL}
          methods={PAY_METHODS}
          outlets={OUTLETS}
        />
        {orders.length >= LIMIT ? (
          <p role="status" className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#8a4b06]">
            Showing the latest {LIMIT} orders. Narrow the dates or filters to see the rest{viewer ? ", or download them all" : ""}.
          </p>
        ) : null}
        <section className="overflow-clip rounded-xl border border-hairline bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline px-4 py-3">
            <h2 className="text-base font-bold text-ink-900">{viewer ? "Orders" : "Your orders"}</h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-2 text-[13px] font-semibold tabular-nums text-ink-700">{orders.length}</span>
            <p className="ml-auto text-sm text-ink-600">Paid {period} <b className="tabular-nums text-ink-900">{formatNaira(paid.reduce((s, o) => s + o.total_kobo, 0))}</b></p>
          </div>
          {orders.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-[13px] text-ink-500">
                    <th scope="col" className="px-3 py-2.5 font-medium">Receipt</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Time</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Counter</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Items</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Sold by</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Method</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                    <th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {orders.map((o) => {
                    const who = o.taken_by ?? o.created_by_name ?? "Staff";
                    const at = o.paid_at ?? o.created_at;
                    return (
                      <tr key={o.id}>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {o.receipt_number ? <span className="font-bold text-ink-900">{o.receipt_number}</span> : <span className="text-ink-900">{o.note || `Order #${o.number}`}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-700" title={formatDateTime(at)}>{f.from === f.to ? timeOf(at) : `${shortDay(businessDateOf(at))}, ${timeOf(at)}`}</td>
                        <td className="px-3 py-2.5 text-ink-700">{OUTLETS[o.outlet]}</td>
                        <td className="px-3 py-2.5 text-ink-900" title={o.items}><span className="block max-w-52 truncate">{o.items}</span></td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[11px] font-bold text-navy-800">{initials(who)}</span>
                            <span className="whitespace-nowrap font-semibold text-ink-900">{who}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-700">{o.method ? METHOD_SHORT[o.method] : "—"}</td>
                        <td className="px-3 py-2.5"><Badge tone={tone[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-ink-900">{formatNaira(o.total_kobo)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/app/sales/orders/${o.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label={`${o.status === "paid" ? "Reprint" : "Open"} ${o.receipt_number ?? `order ${o.number}`}`}>
                            {o.status === "paid" ? "Reprint" : "Open"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-ink-500">No orders for these filters.</p>
          )}
        </section>
      </div>
    </>
  );
}

export default function OrdersPage(props: PageProps<"/app/sales/orders">) {
  return (
    <Suspense fallback={<><PageHeader title="Orders & receipts" description="Every order. Open one to see or reprint its receipt" /><LoadingState /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
