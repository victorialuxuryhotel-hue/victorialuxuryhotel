import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { hotel } from "@/config/hotel";
import { paymentMethod } from "@/domain/status";
import type { PaymentRow, ReservationDetail } from "@/domain/views";
import { formatDate, formatDateTime, formatNaira, plural } from "@/lib/format";
import { vatIncluded } from "@/lib/vat";
import { PaymentBadge } from "./badges";

export function PaymentTable({ rows, receiptHref, reservationHref }: { rows: PaymentRow[]; receiptHref: (n: string) => string; reservationHref?: (p: PaymentRow) => string }) {
  return (
    <>
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((p) => {
          const href = reservationHref?.(p) ?? (p.receiptNumber ? receiptHref(p.receiptNumber) : undefined);
          const body = (
            <span className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5">
              <span className="truncate text-base text-ink-900">{p.guestName}</span>
              <span className="text-right text-base font-medium text-ink-900 tabular-nums">{formatNaira(p.amountKobo)}</span>
              <span className="truncate text-xs text-ink-500 tabular-nums">
                {p.reservationReference} · {paymentMethod[p.method]}
                {p.paidAt ? ` · ${formatDate(p.paidAt.slice(0, 10), { weekday: false, year: false })}` : ""}
              </span>
              <span className="justify-self-end"><PaymentBadge status={p.status} /></span>
            </span>
          );
          return <li key={p.id}>{href ? <Link href={href} className="block hover:bg-ivory-50">{body}</Link> : body}</li>;
        })}
      </ul>
      <div className="hidden md:block">
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
      </div>
    </>
  );
}

export type ReceiptPayment = Pick<PaymentRow, "receiptNumber" | "paidAt" | "method" | "providerReference" | "amountKobo" | "provider" | "recordedBy">;
export type ReceiptStay = Pick<ReservationDetail, "guestName" | "reference" | "category" | "nights" | "checkIn" | "checkOut" | "totalKobo" | "paidKobo"> & { room?: string };

export function Receipt({ payment, reservation, forGuest = false, vatRateBp }: { payment: ReceiptPayment; reservation: ReceiptStay; forGuest?: boolean; vatRateBp?: number }) {
  return (
    <article className="mx-auto max-w-2xl rounded-card border border-hairline bg-ivory-50 p-5 sm:p-12 print:border-0">
      <header className="flex flex-col-reverse gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:pb-8">
        <div className="flex items-center gap-3">
          <Logo className="w-10 shrink-0 sm:w-12" />
          <div>
            <p className="font-display text-xl text-navy-950 sm:text-2xl">{hotel.name}</p>
            <p className="text-xs text-ink-500">{hotel.address.line1}, {hotel.address.city}</p>
            <p className="text-xs text-ink-500">{hotel.phoneDisplay} · {hotel.email}</p>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Receipt</p>
          <p className="font-mono text-sm whitespace-nowrap text-ink-900 sm:mt-1">{payment.receiptNumber}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-5 py-6 text-sm sm:gap-6 sm:py-8">
        <div><dt className="text-ink-500">Received from</dt><dd className="mt-1 font-medium text-ink-900">{reservation.guestName}</dd></div>
        <div><dt className="text-ink-500">Date</dt><dd className="mt-1 text-ink-900">{payment.paidAt ? formatDateTime(payment.paidAt) : "—"}</dd></div>
        <div><dt className="text-ink-500">Reservation</dt><dd className="mt-1 font-mono text-ink-900">{reservation.reference}</dd></div>
        <div><dt className="text-ink-500">Method</dt><dd className="mt-1 text-ink-900">{paymentMethod[payment.method]}{payment.providerReference ? ` · ${payment.providerReference}` : ""}</dd></div>
      </dl>

      <table className="w-full text-sm">
        <thead className="border-y border-hairline text-left text-xs uppercase tracking-wide text-ink-500">
          <tr><th className="py-3 font-medium">Description</th><th className="py-3 text-right font-medium">Amount</th></tr>
        </thead>
        <tbody>
          <tr className="border-b border-hairline">
            <td className="py-4">
              {reservation.room ? `${reservation.room} · ` : ""}{reservation.category} · {plural(reservation.nights, "night")}
              <p className="text-xs text-ink-500">{formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)}</p>
            </td>
            <td className="py-4 text-right tabular-nums">{formatNaira(reservation.totalKobo)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td className="pt-4 text-ink-500">This payment</td><td className="pt-4 text-right text-lg font-semibold tabular-nums">{formatNaira(payment.amountKobo)}</td></tr>
          {vatRateBp ? (
            <tr><td className="pt-1 text-ink-500">Includes VAT ({vatRateBp / 100}%)</td><td className="pt-1 text-right tabular-nums">{formatNaira(vatIncluded(payment.amountKobo, vatRateBp))}</td></tr>
          ) : null}
          <tr><td className="pt-1 text-ink-500">Balance remaining</td><td className="pt-1 text-right tabular-nums">{formatNaira(reservation.totalKobo - reservation.paidKobo)}</td></tr>
        </tfoot>
      </table>

      <footer className="mt-10 flex items-center gap-2 border-t border-hairline pt-6 text-xs text-ink-500">
        <ShieldCheck className="size-4 text-success-600" aria-hidden />
        {payment.provider === "paystack" ? "Payment verified with Paystack." : forGuest ? "Payment received at the front desk." : `Payment received and recorded by ${payment.recordedBy}.`} Thank you for staying with us.
      </footer>
    </article>
  );
}
