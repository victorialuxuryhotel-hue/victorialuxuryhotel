import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { CancelOrderForm, PrintReceiptButton, VoidSaleForm } from "@/components/management/pos-actions";
import { PosReceipt } from "@/components/management/pos-receipt";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { recordId } from "@/lib/ids";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { first, getDb } from "@/server/db";
import { getOrder, ORDER_STATUS, OUTLETS, type OrderStatus } from "@/server/domain/pos";
import { VAT_SHOWN_SQL } from "@/server/vat";

export const metadata: Metadata = { title: "Order" };

const tone: Record<OrderStatus, Tone> = { open: "warning", paid: "success", cancelled: "neutral", void: "danger" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["pos.sell", "pos.view"])) return <AccessDenied />;
  const id = (await params).id;
  if (!recordId().safeParse(id).success) notFound();
  const reader = await authorizeRead(["pos.sell", "pos.view"]);
  const db = await getDb();
  const [o, settings] = await Promise.all([getOrder(db, actorOf(reader), id), first<{ vat_rate_bp: number; tax_id: string | null }>(db, `SELECT ${VAT_SHOWN_SQL} AS vat_rate_bp, tax_id FROM hotel_settings WHERE id = 1`)]);
  if (!o) notFound();
  const receipt = o.receipt_number && o.paid_at && o.method;
  const row = "flex justify-between gap-4 py-2";
  return (
    <div className="grid gap-6 px-4 py-6 lg:grid-cols-[1fr_24rem] lg:px-8">
      <div className="space-y-5 print:hidden">
        <Link href="/app/sales/orders" className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900"><ArrowLeft className="size-4" aria-hidden /> Orders & receipts</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-navy-950">Order #{o.number}</h1>
          <Badge tone={tone[o.status]}>{ORDER_STATUS[o.status]}</Badge>
        </div>
        <Card>
          <dl className="divide-y divide-hairline px-5 text-sm">
            <div className={row}><dt className="text-ink-500">Counter</dt><dd>{OUTLETS[o.outlet]}{o.note ? ` · ${o.note}` : ""}</dd></div>
            <div className={row}><dt className="text-ink-500">Taken</dt><dd className="text-right">{formatDateTime(o.created_at)} by {o.created_by_name ?? "staff"}</dd></div>
            {o.paid_at ? <div className={row}><dt className="text-ink-500">Paid</dt><dd className="text-right">{formatDateTime(o.paid_at)} by {o.taken_by ?? "staff"}</dd></div> : null}
            {o.closed_at ? (
              <div className={row}>
                <dt className="text-ink-500">{o.status === "void" ? "Voided" : "Cancelled"}</dt>
                <dd className="text-right">{formatDateTime(o.closed_at)} by {o.closed_by_name ?? "staff"}{o.close_reason ? <span className="block text-ink-600">“{o.close_reason}”</span> : null}</dd>
              </div>
            ) : null}
            <div className={row}><dt className="text-ink-500">Total</dt><dd className="font-semibold tabular-nums">{formatNaira(o.total_kobo)}</dd></div>
          </dl>
        </Card>
        {o.status === "open" ? (
          <div className="flex flex-wrap gap-3">
            {can(staff.role, "pos.sell") ? <Link href={`/app/sales?order=${o.id}`} className={buttonStyles()}>Open in till to take payment</Link> : null}
            {can(staff.role, "pos.sell") ? <CancelOrderForm id={o.id} /> : null}
          </div>
        ) : null}
        {o.status === "paid" && can(staff.role, "pos.manage") ? <VoidSaleForm id={o.id} total={formatNaira(o.total_kobo)} /> : null}
      </div>
      <div className="space-y-3">
        {receipt ? (
          <>
            <PosReceipt
              r={{
                outlet: o.outlet, receiptNumber: o.receipt_number!, orderNumber: o.number, paidAt: o.paid_at!, totalKobo: o.total_kobo, method: o.method!,
                cashReceivedKobo: o.cash_received_kobo, reference: o.payment_reference, attendant: o.taken_by ?? "staff", vatRateBp: settings?.vat_rate_bp ?? 0, taxId: settings?.tax_id ?? null,
                lines: o.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitKobo: l.unit_price_kobo })),
                voided: o.status === "void" ? { reason: o.close_reason ?? "", at: o.closed_at } : null,
              }}
            />
            <div className="flex justify-center print:hidden"><PrintReceiptButton /></div>
          </>
        ) : (
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-900">Items</p>
            <ul className="mt-2 divide-y divide-hairline text-sm">
              {o.lines.map((l) => (
                <li key={l.line} className="flex justify-between gap-3 py-2"><span>{l.quantity} × {l.name}</span><span className="tabular-nums">{formatNaira(l.quantity * l.unit_price_kobo)}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-500">A receipt is made when the order is paid.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function OrderPage(props: PageProps<"/app/sales/orders/[id]">) {
  return <Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense>;
}
