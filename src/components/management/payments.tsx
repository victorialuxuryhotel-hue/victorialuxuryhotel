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
          <TH>Booking</TH>
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

export function Receipt({ payment, reservation, forGuest = false, vatRateBp, taxId, copy = false }: { payment: ReceiptPayment; reservation: ReceiptStay; forGuest?: boolean; vatRateBp?: number; taxId?: string | null; copy?: boolean }) {
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Receipt{copy ? " · COPY" : ""}</p>
          <p className="font-mono text-sm whitespace-nowrap text-ink-900 sm:mt-1">{payment.receiptNumber}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-5 py-6 text-sm sm:gap-6 sm:py-8">
        <div><dt className="text-ink-500">Received from</dt><dd className="mt-1 font-medium text-ink-900">{reservation.guestName}</dd></div>
        <div><dt className="text-ink-500">Date</dt><dd className="mt-1 text-ink-900">{payment.paidAt ? formatDateTime(payment.paidAt) : "—"}</dd></div>
        <div><dt className="text-ink-500">Booking</dt><dd className="mt-1 font-mono text-ink-900">{reservation.reference}</dd></div>
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
            <>
              <tr><td className="pt-1 text-ink-500">Includes VAT ({vatRateBp / 100}%)</td><td className="pt-1 text-right tabular-nums">{formatNaira(vatIncluded(payment.amountKobo, vatRateBp))}</td></tr>
              {taxId ? <tr><td className="pt-1 text-ink-500">TIN</td><td className="pt-1 text-right tabular-nums">{taxId}</td></tr> : null}
            </>
          ) : null}
          <tr><td className="pt-1 text-ink-500">Still owed</td><td className="pt-1 text-right tabular-nums">{formatNaira(reservation.totalKobo - reservation.paidKobo)}</td></tr>
        </tfoot>
      </table>

      <footer className="mt-10 flex items-center gap-2 border-t border-hairline pt-6 text-xs text-ink-500">
        <ShieldCheck className="size-4 text-success-600" aria-hidden />
        {payment.provider === "paystack" ? "Payment verified with Paystack." : forGuest ? "Payment received at the front desk." : `Payment received and recorded by ${payment.recordedBy}.`} Thank you for staying with us.
      </footer>
    </article>
  );
}

export type BillStay = ReceiptStay & { payments: PaymentRow[]; status: string };
export type BillLines = {
  roomKobo: number; nightlyRateKobo: number; nights: number; extrasKobo: number; roomChangeKobo: number; discountKobo: number; promoCode: string | null;
  extras: { name: string; unitKobo: number; perNight: boolean; amountKobo: number }[];
};

export function GuestBill({ stay, lines, vatRateBp, printedAt, taxId }: { stay: BillStay; lines: BillLines; vatRateBp: number; printedAt: string; taxId?: string | null }) {
  const extrasListed = lines.extras.reduce((s, e) => s + e.amountKobo, 0);
  const adjustment = lines.extrasKobo - extrasListed;
  const paid = stay.payments.filter((p) => p.status === "successful");
  const balance = stay.totalKobo - stay.paidKobo;
  const row = "border-b border-hairline";
  const amount = "py-3 text-right tabular-nums whitespace-nowrap";
  return (
    <article className="mx-auto max-w-2xl rounded-card border border-hairline bg-ivory-50 p-5 sm:p-12 print:border-0 print:p-0">
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Guest bill</p>
          <p className="font-mono text-sm whitespace-nowrap text-ink-900 sm:mt-1">{stay.reference}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-5 py-6 text-sm sm:grid-cols-3 sm:gap-6 sm:py-8">
        <div><dt className="text-ink-500">Guest</dt><dd className="mt-1 font-medium text-ink-900">{stay.guestName}</dd></div>
        <div><dt className="text-ink-500">Room</dt><dd className="mt-1 text-ink-900">{stay.room ? `${stay.room} · ` : ""}{stay.category}</dd></div>
        <div><dt className="text-ink-500">Printed</dt><dd className="mt-1 text-ink-900">{formatDateTime(printedAt)}</dd></div>
        <div><dt className="text-ink-500">Arrival</dt><dd className="mt-1 text-ink-900">{formatDate(stay.checkIn)}</dd></div>
        <div><dt className="text-ink-500">Departure</dt><dd className="mt-1 text-ink-900">{formatDate(stay.checkOut)}</dd></div>
        <div><dt className="text-ink-500">Nights</dt><dd className="mt-1 text-ink-900">{stay.nights}</dd></div>
      </dl>

      <table className="w-full text-sm">
        <thead className="border-y border-hairline text-left text-xs uppercase tracking-wide text-ink-500">
          <tr><th className="py-3 font-medium">Charges</th><th className="py-3 text-right font-medium">Amount</th></tr>
        </thead>
        <tbody>
          <tr className={row}>
            <td className="py-3">Room: {stay.category}<p className="text-xs text-ink-500">{plural(lines.nights, "night")} × {formatNaira(lines.nightlyRateKobo)}</p></td>
            <td className={amount}>{formatNaira(lines.roomKobo)}</td>
          </tr>
          {lines.extras.map((e) => (
            <tr key={e.name} className={row}>
              <td className="py-3">{e.name}{e.perNight ? <p className="text-xs text-ink-500">{plural(lines.nights, "night")} × {formatNaira(e.unitKobo)}</p> : null}</td>
              <td className={amount}>{formatNaira(e.amountKobo)}</td>
            </tr>
          ))}
          {adjustment ? (
            <tr className={row}><td className="py-3">Other extras</td><td className={amount}>{formatNaira(adjustment)}</td></tr>
          ) : null}
          {lines.roomChangeKobo ? (
            <tr className={row}><td className="py-3">Room change to a higher room type</td><td className={amount}>{formatNaira(lines.roomChangeKobo)}</td></tr>
          ) : null}
          {lines.discountKobo ? (
            <tr className={row}><td className="py-3">Discount{lines.promoCode ? ` (${lines.promoCode})` : ""}</td><td className={amount}>−{formatNaira(lines.discountKobo)}</td></tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr><td className="pt-3 font-semibold text-ink-900">Total charges</td><td className="pt-3 text-right font-semibold tabular-nums">{formatNaira(stay.totalKobo)}</td></tr>
          {vatRateBp ? <tr><td className="pt-1 text-xs text-ink-500">Includes VAT ({vatRateBp / 100}%)</td><td className="pt-1 text-right text-xs tabular-nums text-ink-500">{formatNaira(vatIncluded(stay.totalKobo, vatRateBp))}</td></tr> : null}
          {vatRateBp && taxId ? <tr><td className="pt-1 text-xs text-ink-500">TIN</td><td className="pt-1 text-right text-xs tabular-nums text-ink-500">{taxId}</td></tr> : null}
        </tfoot>
      </table>

      <table className="mt-8 w-full text-sm">
        <thead className="border-y border-hairline text-left text-xs uppercase tracking-wide text-ink-500">
          <tr><th className="py-3 font-medium">Payments</th><th className="py-3 font-medium">Receipt</th><th className="py-3 text-right font-medium">Amount</th></tr>
        </thead>
        <tbody>
          {paid.length ? (
            paid.map((p) => (
              <tr key={p.id} className={row}>
                <td className="py-3">
                  {p.kind === "refund" ? "Correction" : p.provider === "paystack" ? "Card online" : paymentMethod[p.method]}
                  <p className="text-xs text-ink-500">{p.paidAt ? formatDateTime(p.paidAt) : ""}</p>
                </td>
                <td className="py-3 font-mono text-xs">{p.receiptNumber ?? ""}</td>
                <td className={amount}>{p.kind === "refund" ? "−" : ""}{formatNaira(p.amountKobo)}</td>
              </tr>
            ))
          ) : (
            <tr className={row}><td colSpan={3} className="py-3 text-ink-500">No payments yet.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} className="pt-3 text-ink-500">Total paid</td><td className="pt-3 text-right tabular-nums">{formatNaira(stay.paidKobo)}</td></tr>
          <tr>
            <td colSpan={2} className="pt-2 text-base font-semibold text-ink-900">{balance > 0 ? "Owed" : balance < 0 ? "Paid over" : "Paid in full"}</td>
            <td className="pt-2 text-right text-lg font-semibold tabular-nums">{formatNaira(Math.abs(balance))}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-12 grid gap-10 border-t border-hairline pt-6 text-xs text-ink-500 sm:grid-cols-2">
        <p>Thank you for staying with us.</p>
        <p className="border-t border-ink-400 pt-2 sm:mt-6">Guest signature</p>
      </footer>
    </article>
  );
}
