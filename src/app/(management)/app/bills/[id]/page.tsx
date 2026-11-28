import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { CancelBillButton, PayBillForm } from "@/components/management/bills";
import { PrintReceiptButton } from "@/components/management/pos-actions";
import { LoadingState } from "@/components/ui/feedback";
import { hotel } from "@/config/hotel";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatNaira } from "@/lib/format";
import { hotelToday } from "@/lib/hotel-date";
import { actorOf, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { getBill } from "@/server/domain/bills";
import { paymentSettings } from "@/server/domain/payment-details";

export const metadata: Metadata = { title: "Company bill" };

/** The company bill on A4 (design P3). Clearly not a receipt. */
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "bills.manage")) return <AccessDenied />;
  const db = await getDb();
  const [bill, pay] = await Promise.all([getBill(db, actorOf(staff), (await params).id), paymentSettings(db)]);
  if (!bill) notFound();
  const bank = `${pay.bank.name ?? "[HOTEL BANK]"} · ${pay.bank.number ?? "[ACCOUNT NUMBER]"} · ${pay.bank.accountName ?? "[ACCOUNT NAME]"}`;
  const noBank = !pay.bank.name || !pay.bank.number || !pay.bank.accountName;
  return (
    <div className="grid gap-6 px-4 py-6 lg:grid-cols-[1fr_24rem] lg:px-8">
      <article data-print="" className="a4-bill rounded-xl border border-hairline bg-white p-10 text-[14px] text-ink-900 print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b border-hairline pb-5">
          <div>
            <p className="font-brand text-3xl text-navy-950">Victoria Luxury</p>
            <p className="mt-1 text-xs text-ink-600">{hotel.address.line1}, {hotel.address.city} · {hotel.phoneDisplay}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">Bill to pay before arrival</p>
            <p className="text-sm text-ink-600">{bill.number} · issued {formatDate(bill.createdAt.slice(0, 10))} · valid until {formatDate(bill.validUntil, { year: false })}</p>
            {bill.cancelledAt ? <p className="mt-1 font-bold text-[#a61b1b]">CANCELLED</p> : null}
          </div>
        </header>
        <div className="grid grid-cols-2 gap-6 py-5">
          <div><p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Bill to</p><p className="mt-1 font-semibold">{bill.companyName}</p>{bill.attention ? <p>Attn: {bill.attention}</p> : null}</div>
          <div><p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">For</p><p className="mt-1">{bill.guests} guest{bill.guests === 1 ? "" : "s"} · {formatDate(bill.checkIn, { weekday: true, year: false })} – {formatDate(bill.checkOut, { weekday: true, year: false })}</p><p>Bookings {bill.references.join(", ")}</p></div>
        </div>
        <table className="w-full">
          <thead className="border-y border-ink-900 text-left text-xs uppercase"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-hairline tabular-nums">
            {bill.lines.map((l) => (
              <tr key={l.item + l.rateKobo}><td className="py-2">{l.item}</td><td className="py-2 text-right">{l.quantity}</td><td className="py-2 text-right">{formatNaira(l.rateKobo)}</td><td className="py-2 text-right">{formatNaira(l.amountKobo)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-ink-900 text-base font-bold"><td className="py-3" colSpan={3}>Total due</td><td className="py-3 text-right tabular-nums">{formatNaira(bill.totalKobo)}</td></tr></tfoot>
        </table>
        <p className="mt-6">
          <b>How to pay:</b> {noBank ? "Ask the front desk for the account details" : `transfer to ${bank}`}, with reference <b>{bill.number}</b>. Or pay at the front desk.
        </p>
        <p className="mt-2 text-ink-700">The rooms are confirmed once payment arrives. If it hasn&apos;t arrived by the valid-until date, the rooms may be released.</p>
        <p className="mt-6 border-t border-hairline pt-3 text-center font-semibold">This is a bill, not a receipt. A numbered receipt is issued when payment is received.</p>
      </article>
      <aside className="space-y-4 print:hidden">
        <Link href="/app/bills" className="text-sm text-ink-600 hover:underline">← Company bills</Link>
        <div className="flex flex-wrap gap-2"><PrintReceiptButton /></div>
        {!bill.cancelledAt && bill.owedKobo > 0 && can(staff.role, "payments.record") ? (
          <section className="rounded-xl border border-hairline bg-white p-4">
            <h2 className="mb-3 text-base font-bold">Record payment · {formatNaira(bill.owedKobo)} owed</h2>
            <PayBillForm billId={bill.id} owedKobo={bill.owedKobo} terminals={pay.terminals} today={hotelToday()} />
          </section>
        ) : bill.owedKobo === 0 ? <p className="rounded-xl bg-[#e7f6ec] p-4 text-sm text-[#166534]">Paid in full.</p> : null}
        {!bill.cancelledAt ? <CancelBillButton id={bill.id} /> : null}
      </aside>
    </div>
  );
}

export default function BillPage(props: PageProps<"/app/bills/[id]">) {
  return <Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense>;
}
