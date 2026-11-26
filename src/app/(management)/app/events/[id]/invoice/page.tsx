import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Logo } from "@/components/brand/logo";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { PrintButton } from "@/components/management/print-button";
import { PrintAs, ThermalReceipt } from "@/components/management/thermal";
import { LoadingState } from "@/components/ui/feedback";
import { hotel } from "@/config/hotel";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { vatIncluded } from "@/lib/vat";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { getDb } from "@/server/db";
import { hallInvoice } from "@/server/domain/events";
import { getBookingRules } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Hall invoice" };

const METHOD = { cash: "Cash", bank_transfer: "Bank transfer", pos_terminal: "POS / card", card: "Card" } as const;
const STATUS = { enquiry: "Enquiry", confirmed: "Confirmed · paid", cancelled: "Cancelled" } as const;

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "events.manage")) return <AccessDenied />;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const reader = await authorizeRead("events.manage");
  const [b, rules] = await Promise.all([hallInvoice(await getDb(), actorOf(reader), id.data), getBookingRules()]);
  if (!b) notFound();
  const vat = rules.vatOnReceipts ? rules.vatRateBp : 0;
  const owed = Math.max(0, b.price_kobo - b.paid_kobo);
  const number = `HALL-${b.id.slice(0, 8).toUpperCase()}`;
  const when = `${formatDate(b.event_date)}, ${b.start_time}–${b.end_time}`;
  const printedAt = nowIso();
  return (
    <>
      <article className="mx-auto max-w-2xl rounded-card border border-hairline bg-ivory-50 p-5 sm:p-12 print:border-0 print:p-0">
        <header className="flex flex-col-reverse gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-start sm:justify-between sm:pb-8">
          <div className="flex items-center gap-3">
            <Logo className="w-10 shrink-0 sm:w-12" />
            <div>
              <p className="font-display text-xl text-navy-950 sm:text-2xl">{hotel.name}</p>
              <p className="text-xs text-ink-500">{hotel.address.line1}, {hotel.address.city}</p>
              <p className="text-xs text-ink-500">{hotel.phoneDisplay} · {hotel.email}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Hall invoice</p>
            <p className="font-mono text-sm text-ink-900 sm:mt-1">{number}</p>
          </div>
        </header>
        <dl className="grid grid-cols-2 gap-5 py-6 text-sm sm:py-8">
          <div><dt className="text-ink-500">Booked by</dt><dd className="mt-1 font-medium text-ink-900">{b.customer_name}</dd></div>
          <div><dt className="text-ink-500">Event</dt><dd className="mt-1 text-ink-900">{b.title}</dd></div>
          <div><dt className="text-ink-500">When</dt><dd className="mt-1 text-ink-900">{when}</dd></div>
          <div><dt className="text-ink-500">Status</dt><dd className="mt-1 text-ink-900">{STATUS[b.status]}</dd></div>
        </dl>
        <table className="w-full text-sm">
          <thead className="border-y border-hairline text-left text-xs uppercase tracking-wide text-ink-500">
            <tr><th className="py-3 font-medium">Payments</th><th className="py-3 font-medium">Reference</th><th className="py-3 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {b.payments.length ? (
              b.payments.map((p) => (
                <tr key={p.id} className="border-b border-hairline">
                  <td className="py-3">{METHOD[p.method]}<p className="text-xs text-ink-500">{formatDate(p.paid_on)}{p.recorded_by_name ? ` · ${p.recorded_by_name}` : ""}</p></td>
                  <td className="py-3 font-mono text-xs">{p.reference ?? ""}</td>
                  <td className="py-3 text-right tabular-nums">{formatNaira(p.amount_kobo)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-b border-hairline"><td colSpan={3} className="py-3 text-ink-500">No payments yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td colSpan={2} className="pt-3 text-ink-500">Price</td><td className="pt-3 text-right tabular-nums">{formatNaira(b.price_kobo)}</td></tr>
            {vat ? <tr><td colSpan={2} className="pt-1 text-xs text-ink-500">Includes VAT ({vat / 100}%)</td><td className="pt-1 text-right text-xs tabular-nums text-ink-500">{formatNaira(vatIncluded(b.price_kobo, vat))}</td></tr> : null}
            {vat && rules.taxId ? <tr><td colSpan={2} className="pt-1 text-xs text-ink-500">TIN</td><td className="pt-1 text-right text-xs tabular-nums text-ink-500">{rules.taxId}</td></tr> : null}
            <tr><td colSpan={2} className="pt-1 text-ink-500">Paid</td><td className="pt-1 text-right tabular-nums">{formatNaira(b.paid_kobo)}</td></tr>
            <tr><td colSpan={2} className="pt-2 text-base font-semibold text-ink-900">{owed ? "Owed" : "Paid in full"}</td><td className="pt-2 text-right text-lg font-semibold tabular-nums">{formatNaira(owed)}</td></tr>
          </tfoot>
        </table>
        <footer className="mt-10 border-t border-hairline pt-6 text-xs text-ink-500">Printed {formatDateTime(printedAt)}. The booking is confirmed once paid in full.</footer>
      </article>
      <PrintAs
        thermal={
          <ThermalReceipt
            title="Hall invoice"
            number={number}
            rows={[["Booked by", b.customer_name], ["Event", b.title], ["When", when], ["Status", STATUS[b.status]]]}
            lines={b.payments.map((p) => ({ name: `${METHOD[p.method]}${p.reference ? ` · ${p.reference}` : ""}`, detail: formatDate(p.paid_on, { year: false }), amount: formatNaira(p.amount_kobo) }))}
            total={["Price", formatNaira(b.price_kobo)]}
            after={[
              ...(vat ? ([["Includes VAT", formatNaira(vatIncluded(b.price_kobo, vat))], ...(rules.taxId ? [["TIN", rules.taxId] as [string, string]] : [])] as [string, string][]) : []),
              ["Paid", formatNaira(b.paid_kobo)],
              [owed ? "Owed" : "Balance", owed ? formatNaira(owed) : "Paid in full"],
            ]}
            footer="Thank you."
          />
        }
      />
    </>
  );
}

export default function HallInvoicePage(props: PageProps<"/app/events/[id]/invoice">) {
  return (
    <>
      <div className="print:hidden"><PageHeader title="Hall invoice" actions={<PrintButton />} /></div>
      <div className="px-4 py-8 lg:px-8 print:p-0"><Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense></div>
    </>
  );
}
