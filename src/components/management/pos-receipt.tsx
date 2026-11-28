import { hotel } from "@/config/hotel";
import { formatDateTime, formatNaira } from "@/lib/format";
import { vatIncluded } from "@/lib/vat";
import { cn } from "@/lib/utils/cn";

export type PosReceiptData = {
  outlet: "restaurant" | "bar";
  receiptNumber: string;
  orderNumber: number;
  paidAt: string;
  lines: { name: string; quantity: number; unitKobo: number; note?: string | null }[];
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
  const plain = (k: number) => (k / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const when = new Date(r.paidAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).replace(",", "");
  return (
    <article data-print={printable ? "" : undefined} className={cn("pos-receipt mx-auto w-full max-w-[20rem] rounded-xl border border-hairline bg-white p-5 text-[13px] leading-snug text-ink-900 tabular-nums print:max-w-none print:border-0 print:p-0", className)}>
      <header className="border-b border-dashed border-ink-400 pb-3 text-center">
        <p className="font-brand text-lg tracking-[0.15em] uppercase">Victoria Luxury</p>
        <p className="text-xs">{r.outlet === "bar" ? "Bar" : "Restaurant"} · {hotel.address.line1.split(",").at(-1)?.trim() || hotel.address.line1}, {hotel.address.city}</p>
        {r.copy ? <p className="mt-1 text-sm font-bold tracking-[0.3em]">COPY</p> : null}
      </header>
      <div className="border-b border-dashed border-ink-400 py-2.5 text-center">
        <p className="font-bold">Receipt {r.receiptNumber}</p>
        <p className="text-xs">{when} · {r.attendant.split(" ")[0]} · order #{r.orderNumber}</p>
      </div>
      <ul className="space-y-1 border-b border-dashed border-ink-400 py-2.5">
        {r.lines.map((l, i) => (
          <li key={i}>
            <p className={row}><span>{l.quantity} × {l.name}</span><span>{plain(l.quantity * l.unitKobo)}</span></p>
            {l.note ? <p className="pl-4 text-xs italic">– {l.note}</p> : null}
          </li>
        ))}
      </ul>
      <dl className="space-y-0.5 py-2.5">
        <div className={cn(row, "text-base font-bold")}><dt>TOTAL</dt><dd>{formatNaira(r.totalKobo)}</dd></div>
        {r.method === "cash" && r.cashReceivedKobo != null ? (
          <>
            <div className={row}><dt>Cash</dt><dd>{plain(r.cashReceivedKobo)}</dd></div>
            <div className={row}><dt>Change</dt><dd>{plain(r.cashReceivedKobo - r.totalKobo)}</dd></div>
          </>
        ) : (
          <div className={row}><dt>{METHOD[r.method]}</dt><dd>{r.reference ? (r.method === "pos_terminal" ? `slip …${r.reference}` : `ref ${r.reference}`) : ""}</dd></div>
        )}
        {r.vatRateBp ? <div className={cn(row, "text-xs")}><dt>Includes VAT ({r.vatRateBp / 100}%)</dt><dd>{formatNaira(vatIncluded(r.totalKobo, r.vatRateBp))}</dd></div> : null}
        {r.vatRateBp && r.taxId ? <div className={cn(row, "text-xs")}><dt>TIN</dt><dd>{r.taxId}</dd></div> : null}
      </dl>
      {r.voided ? (
        <p className="rounded border-2 border-danger-600 p-2 text-center text-sm font-bold text-danger-700">VOIDED{r.voided.at ? ` ${formatDateTime(r.voided.at)}` : ""}: {r.voided.reason}</p>
      ) : (
        <p className="border-t border-dashed border-ink-400 pt-2.5 text-center text-xs">Thank you. See you again!</p>
      )}
    </article>
  );
}
