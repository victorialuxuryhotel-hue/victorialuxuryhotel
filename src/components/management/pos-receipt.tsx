import { hotel } from "@/config/hotel";
import { formatDateTime, formatNaira } from "@/lib/format";
import { vatIncluded } from "@/lib/vat";
import { cn } from "@/lib/utils/cn";

export type PosReceiptData = {
  outlet: "restaurant" | "bar";
  receiptNumber: string;
  orderNumber: number;
  paidAt: string;
  lines: { name: string; quantity: number; unitKobo: number }[];
  totalKobo: number;
  method: "cash" | "bank_transfer" | "pos_terminal";
  /** Transfer reference, or the last 4 digits of the POS slip. */
  reference?: string | null;
  cashReceivedKobo: number | null;
  attendant: string;
  vatRateBp: number;
  /** Printed with the VAT line: a VAT receipt carries the hotel's Tax ID. */
  taxId?: string | null;
  voided?: { reason: string; at: string | null } | null;
  /** A reprint (more than 10 minutes after the sale): marked COPY. */
  copy?: boolean;
};

const METHOD = { cash: "Cash", bank_transfer: "Bank transfer", pos_terminal: "POS / card" } as const;

/** A till-roll style receipt. Prints on its own: everything else on the page is hidden when printing. */
export function PosReceipt({ r, className, printable = true }: { r: PosReceiptData; className?: string; printable?: boolean }) {
  const row = "flex justify-between gap-3";
  return (
    <article data-print={printable ? "" : undefined} className={cn("pos-receipt mx-auto w-full max-w-[22rem] rounded-card border border-hairline bg-white p-5 font-mono text-[13px] leading-relaxed text-ink-900 print:max-w-none print:border-0 print:p-0", className)}>
      <header className="border-b border-dashed border-ink-400 pb-3 text-center">
        <p className="font-display text-lg leading-tight">{hotel.name}</p>
        <p className="text-xs uppercase tracking-[0.2em]">{r.outlet === "bar" ? "Bar" : "Restaurant"}</p>
        <p className="text-xs text-ink-600">{hotel.address.line1}, {hotel.address.city}</p>
        <p className="text-xs text-ink-600">{hotel.phoneDisplay}</p>
        {r.copy ? <p className="mt-1 text-sm font-bold tracking-[0.3em]">COPY</p> : null}
      </header>
      <dl className="space-y-0.5 border-b border-dashed border-ink-400 py-3 text-xs">
        <div className={row}><dt>Receipt</dt><dd>{r.receiptNumber}</dd></div>
        <div className={row}><dt>Order</dt><dd>#{r.orderNumber}</dd></div>
        <div className={row}><dt>Date</dt><dd>{formatDateTime(r.paidAt)}</dd></div>
        <div className={row}><dt>Served by</dt><dd className="text-right">{r.attendant}</dd></div>
      </dl>
      <ul className="space-y-1.5 border-b border-dashed border-ink-400 py-3">
        {r.lines.map((l, i) => (
          <li key={i}>
            <p>{l.name}</p>
            <p className={cn(row, "text-ink-700")}>
              <span>{l.quantity} × {formatNaira(l.unitKobo)}</span>
              <span className="tabular-nums text-ink-900">{formatNaira(l.quantity * l.unitKobo)}</span>
            </p>
          </li>
        ))}
      </ul>
      <dl className="space-y-0.5 py-3">
        <div className={cn(row, "text-base font-bold")}><dt>Total</dt><dd className="tabular-nums">{formatNaira(r.totalKobo)}</dd></div>
        <div className={row}><dt>Paid by</dt><dd>{METHOD[r.method]}</dd></div>
        {r.reference ? <div className={row}><dt>{r.method === "pos_terminal" ? "POS slip" : "Reference"}</dt><dd>{r.method === "pos_terminal" ? `…${r.reference}` : r.reference}</dd></div> : null}
        {r.method === "cash" && r.cashReceivedKobo != null ? (
          <>
            <div className={row}><dt>Cash given</dt><dd className="tabular-nums">{formatNaira(r.cashReceivedKobo)}</dd></div>
            <div className={row}><dt>Change</dt><dd className="tabular-nums">{formatNaira(r.cashReceivedKobo - r.totalKobo)}</dd></div>
          </>
        ) : null}
        {r.vatRateBp ? <div className={cn(row, "text-xs text-ink-600")}><dt>Includes VAT ({r.vatRateBp / 100}%)</dt><dd className="tabular-nums">{formatNaira(vatIncluded(r.totalKobo, r.vatRateBp))}</dd></div> : null}
        {r.vatRateBp && r.taxId ? <div className={cn(row, "text-xs text-ink-600")}><dt>TIN</dt><dd className="tabular-nums">{r.taxId}</dd></div> : null}
      </dl>
      {r.voided ? (
        <p className="rounded border-2 border-danger-600 p-2 text-center text-sm font-bold text-danger-700">VOIDED{r.voided.at ? ` ${formatDateTime(r.voided.at)}` : ""}: {r.voided.reason}</p>
      ) : (
        <p className="border-t border-dashed border-ink-400 pt-3 text-center text-xs">Thank you. Please come again.</p>
      )}
    </article>
  );
}
