import { hotel } from "@/config/hotel";
import { paymentMethod } from "@/domain/status";
import { formatDate, formatNaira } from "@/lib/format";
import { vatIncluded } from "@/lib/vat";
import type { BillLines, ReceiptPayment, ReceiptStay } from "./payments";

/** The A4 room receipt (design P2): the stay, what it cost line by line, this payment, and the balance. */
export function RoomReceipt({ payment, stay, lines, vatRateBp, taxId, copy }: { payment: ReceiptPayment; stay: ReceiptStay; lines: BillLines; vatRateBp: number; taxId?: string | null; copy: boolean }) {
  const balance = stay.totalKobo - stay.paidKobo;
  const earlier = stay.paidKobo - payment.amountKobo;
  const how = payment.provider === "paystack" ? "card online" : paymentMethod[payment.method].toLowerCase();
  const cell = "py-2.5";
  return (
    <article className="mx-auto max-w-[794px] rounded-xl border border-hairline bg-white p-12 text-[14px] text-ink-900 tabular-nums print:rounded-none print:border-0 print:p-0">
      <header className="flex items-start justify-between gap-6 border-b border-hairline pb-5">
        <div>
          <p className="font-brand text-3xl text-navy-950">Victoria Luxury</p>
          <p className="mt-1 text-xs text-ink-600">{hotel.address.line1}, {hotel.address.city} · {hotel.phoneDisplay}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">Receipt{copy ? " · COPY" : ""}</p>
          <p className="text-sm text-ink-600">{payment.receiptNumber} · {payment.paidAt ? formatDate(payment.paidAt.slice(0, 10)) : ""}</p>
        </div>
      </header>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-3 py-5">
        {[
          ["Guest", stay.guestName],
          ["Booking", stay.reference],
          ["Room", `${stay.category}${stay.room ? ` · ${stay.room.replace(/^Room /, "")}` : ""}`],
          ["Arrive", formatDate(stay.checkIn, { weekday: true, year: false })],
          ["Leave", formatDate(stay.checkOut, { weekday: true, year: false })],
          ["Nights", String(stay.nights)],
        ].map(([k, v]) => (
          <div key={k}><dt className="text-xs font-semibold tracking-wider text-ink-500 uppercase">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
        ))}
      </dl>
      <table className="w-full">
        <thead className="border-y border-ink-900 text-left text-xs uppercase"><tr><th className={cell}>Item</th><th className={`${cell} text-right`}>Qty</th><th className={`${cell} text-right`}>Amount</th></tr></thead>
        <tbody className="divide-y divide-hairline">
          <tr><td className={cell}>{stay.category} room, per night</td><td className={`${cell} text-right`}>{lines.nights}</td><td className={`${cell} text-right`}>{formatNaira(lines.roomKobo)}</td></tr>
          {lines.extras.map((e) => (
            <tr key={e.name}><td className={cell}>{e.name}</td><td className={`${cell} text-right`}>{e.perNight ? lines.nights : 1}</td><td className={`${cell} text-right`}>{formatNaira(e.amountKobo)}</td></tr>
          ))}
          {lines.roomChangeKobo ? <tr><td className={cell}>Room change</td><td /><td className={`${cell} text-right`}>{formatNaira(lines.roomChangeKobo)}</td></tr> : null}
          {lines.discountKobo ? <tr><td className={cell}>Discount{lines.promoCode ? ` (${lines.promoCode})` : ""}</td><td /><td className={`${cell} text-right`}>−{formatNaira(lines.discountKobo)}</td></tr> : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-900 font-bold"><td className={cell} colSpan={2}>Total</td><td className={`${cell} text-right`}>{formatNaira(stay.totalKobo)}</td></tr>
          {earlier > 0 ? <tr><td className="py-1 text-ink-700" colSpan={2}>Paid before</td><td className="py-1 text-right">−{formatNaira(earlier)}</td></tr> : null}
          <tr><td className="py-1" colSpan={2}>Paid by {how}{payment.providerReference ? ` · ${payment.method === "pos_terminal" ? `slip …${payment.providerReference}` : payment.providerReference}` : ""} · {payment.receiptNumber}</td><td className="py-1 text-right">−{formatNaira(payment.amountKobo)}</td></tr>
          <tr className="font-bold"><td className="py-1" colSpan={2}>Balance</td><td className="py-1 text-right">{formatNaira(Math.max(0, balance))}</td></tr>
          {vatRateBp ? <tr><td className="py-1 text-xs text-ink-600" colSpan={2}>Includes VAT ({vatRateBp / 100}%){taxId ? ` · TIN ${taxId}` : ""}</td><td className="py-1 text-right text-xs">{formatNaira(vatIncluded(payment.amountKobo, vatRateBp))}</td></tr> : null}
        </tfoot>
      </table>
      <p className="mt-8 border-t border-hairline pt-4 text-sm text-ink-700">
        Thank you for staying with us.{payment.provider === "paystack" ? " Paid online through Paystack." : payment.recordedBy ? ` Checked by ${payment.recordedBy}.` : ""} This receipt was issued by {hotel.name}.
      </p>
    </article>
  );
}
