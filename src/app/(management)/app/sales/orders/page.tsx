import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { businessDate } from "@/lib/hotel-date";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { all, getDb } from "@/server/db";
import { listOrders, ORDER_STATUS, OUTLETS, PAY_METHODS, type OrderStatus } from "@/server/domain/pos";
import { orderFilters } from "@/server/pos-filters";

export const metadata: Metadata = { title: "Orders & receipts" };

const LIMIT = 200;

const tone: Record<OrderStatus, Tone> = { open: "warning", paid: "success", cancelled: "neutral", void: "danger" };

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
  return (
    <div className="space-y-5 px-4 py-6 lg:px-8">
      <form className="grid gap-3 rounded-card border border-hairline bg-ivory-50 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <label className="text-[13px] text-ink-700">From<Input type="date" name="from" defaultValue={f.from} max={businessDate()} className="mt-1" /></label>
        <label className="text-[13px] text-ink-700">To<Input type="date" name="to" defaultValue={f.to} max={businessDate()} className="mt-1" /></label>
        <label className="text-[13px] text-ink-700">Paid by
          <Select name="method" defaultValue={f.method ?? ""} className="mt-1">
            <option value="">Any method</option>
            {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <label className="text-[13px] text-ink-700">Status
          <Select name="status" defaultValue={f.status ?? ""} className="mt-1">
            <option value="">Any status</option>
            {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <div className="hidden lg:block" />
        <label className="text-[13px] text-ink-700">Counter
          <Select name="outlet" defaultValue={f.outlet ?? ""} className="mt-1">
            <option value="">Restaurant and bar</option>
            {Object.entries(OUTLETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        {viewer ? (
          <label className="text-[13px] text-ink-700">Sold by
            <Select name="staff" defaultValue={f.staffId ?? ""} className="mt-1">
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
        ) : null}
        <label className="text-[13px] text-ink-700 sm:col-span-2 lg:col-span-1">Search
          <Input name="q" defaultValue={f.q ?? ""} placeholder="Receipt, order no. or item" className="mt-1" />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonStyles({ className: "w-full" })}>Show</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {orders.length} order{orders.length === 1 ? "" : "s"} · paid <b className="tabular-nums text-ink-900">{formatNaira(paid.reduce((s, o) => s + o.total_kobo, 0))}</b>
          {viewer ? null : " · showing your orders"}
        </p>
        {orders.length >= LIMIT ? (
          <p role="status" className="w-full rounded-md border border-warning-600/30 bg-warning-50 px-4 py-2 text-sm text-warning-700">
            Showing the latest {LIMIT} orders. Narrow the dates or filters to see the rest{viewer ? ", or download them all" : ""}.
          </p>
        ) : null}
        {viewer ? (
          <>
            <a href={`/app/sales/orders/csv?${query}&format=xlsx`} className={buttonStyles({ variant: "secondary", size: "sm" })}><Download className="size-4" aria-hidden /> Download (Excel)</a>
            <a href={`/app/sales/orders/csv?${query}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>CSV</a>
          </>
        ) : null}
      </div>

      <Card>
        {orders.length ? (
          <ul className="divide-y divide-hairline">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/app/sales/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-ink-900/3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-ink-900">
                      #{o.number} · {OUTLETS[o.outlet]}{o.note ? ` · ${o.note}` : ""}
                      {o.receipt_number ? <span className="ml-2 font-mono text-xs text-ink-500">{o.receipt_number}</span> : null}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {formatDateTime(o.paid_at ?? o.created_at)} · {o.items}{o.method ? ` · ${PAY_METHODS[o.method]}` : ""} · {o.taken_by ?? o.created_by_name ?? "staff"}
                    </p>
                  </div>
                  <Badge tone={tone[o.status]}>{ORDER_STATUS[o.status]}</Badge>
                  <span className="w-28 text-right text-[15px] tabular-nums">{formatNaira(o.total_kobo)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState title="No orders for these filters" /></div>
        )}
      </Card>
    </div>
  );
}

export default function OrdersPage(props: PageProps<"/app/sales/orders">) {
  return (
    <>
      <PageHeader title="Orders & receipts" description="Every restaurant & bar order. Open one to see or reprint its receipt." />
      <Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense>
    </>
  );
}
