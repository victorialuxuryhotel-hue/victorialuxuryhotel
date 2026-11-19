import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { hotel } from "@/config/hotel";
import { paymentMethod } from "@/domain/status";
import type { PaymentRow, ReservationDetail } from "@/domain/views";
import { formatDate, formatDateTime, formatNaira, plural } from "@/lib/format";
import { PaymentBadge } from "./badges";

export function PaymentTable({ rows, receiptHref }: { rows: PaymentRow[]; receiptHref: (n: string) => string }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Date</TH>
          <TH>Reservation</TH>
          <TH>Method</TH>
          <TH>Reference</TH>
          <TH className="text-right">Amount</TH>
          <TH>Status</TH>
          <TH><span className="sr-only">Receipt</span></TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((p) => (
          <TR key={p.id}>
            <TD className="whitespace-nowrap">{p.paidAt ? formatDateTime(p.paidAt) : <span className="text-ink-400">Not paid</span>}</TD>
            <TD>
              <p className="text-ink-900">{p.guestName}</p>
              <p className="font-mono text-xs text-ink-500">{p.reservationReference}</p>
            </TD>
            <TD>
              <p>{paymentMethod[p.method]}</p>
              <p className="text-xs text-ink-500">{p.provider === "paystack" ? "Paystack" : `Offline · ${p.recordedBy}`}</p>
            </TD>
            <TD className="font-mono text-xs">{p.providerReference ?? "—"}</TD>
            <TD className="text-right font-medium tabular-nums text-ink-900">{formatNaira(p.amountKobo)}</TD>
            <TD><PaymentBadge status={p.status} /></TD>
            <TD>
              {p.receiptNumber ? (
                <Link href={receiptHref(p.receiptNumber)} className="text-sm font-medium text-navy-800 hover:text-navy-600">Receipt</Link>
              ) : null}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function Receipt({ payment, reservation }: { payment: PaymentRow; reservation: ReservationDetail }) {
  return (
    <article className="mx-auto max-w-2xl bg-white p-8 shadow-card sm:p-12 print:shadow-none">
      <header className="flex items-start justify-between gap-6 border-b border-ivory-200 pb-8">
        <div className="flex items-center gap-3">
          <Logo className="w-12" />
          <div>
            <p className="font-display text-2xl text-navy-950">{hotel.name}</p>
            <p className="text-xs text-ink-500">{hotel.address.line1}, {hotel.address.city}</p>
            <p className="text-xs text-ink-500">{hotel.phoneDisplay} · {hotel.email}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Receipt</p>
          <p className="mt-1 font-mono text-sm text-ink-900">{payment.receiptNumber}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-6 py-8 text-sm">
        <div><dt className="text-ink-500">Received from</dt><dd className="mt-1 font-medium text-ink-900">{reservation.guestName}</dd></div>
        <div><dt className="text-ink-500">Date</dt><dd className="mt-1 text-ink-900">{payment.paidAt ? formatDateTime(payment.paidAt) : "—"}</dd></div>
        <div><dt className="text-ink-500">Reservation</dt><dd className="mt-1 font-mono text-ink-900">{reservation.reference}</dd></div>
        <div><dt className="text-ink-500">Method</dt><dd className="mt-1 text-ink-900">{paymentMethod[payment.method]}{payment.providerReference ? ` · ${payment.providerReference}` : ""}</dd></div>
      </dl>

      <table className="w-full text-sm">
        <thead className="border-y border-ivory-200 text-left text-xs uppercase tracking-wide text-ink-500">
          <tr><th className="py-3 font-medium">Description</th><th className="py-3 text-right font-medium">Amount</th></tr>
        </thead>
        <tbody>
          <tr className="border-b border-ivory-200">
            <td className="py-4">
              {reservation.category} · {plural(reservation.nights, "night")}
              <p className="text-xs text-ink-500">{formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}</p>
            </td>
            <td className="py-4 text-right tabular-nums">{formatNaira(reservation.totalKobo)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td className="pt-4 text-ink-500">This payment</td><td className="pt-4 text-right text-lg font-semibold tabular-nums">{formatNaira(payment.amountKobo)}</td></tr>
          <tr><td className="pt-1 text-ink-500">Balance remaining</td><td className="pt-1 text-right tabular-nums">{formatNaira(reservation.totalKobo - reservation.paidKobo)}</td></tr>
        </tfoot>
      </table>

      <footer className="mt-10 flex items-center gap-2 border-t border-ivory-200 pt-6 text-xs text-ink-500">
        <ShieldCheck className="size-4 text-success-600" aria-hidden />
        {payment.provider === "paystack" ? "Payment verified with Paystack." : `Payment received and recorded by ${payment.recordedBy}.`} Thank you for staying with us.
      </footer>
    </article>
  );
}
