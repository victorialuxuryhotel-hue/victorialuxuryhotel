import Link from "next/link";
import type { ReactNode } from "react";
import type { FrontDeskSummary } from "@/server/domain/payment-list";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { PaymentList, type ListedRow } from "./payment-list";

/** A KPI tile (design R107): label, a big tabular number in its status colour, a note. Links when there's a list behind it. */
function Tile({ label, value, note, tone, href }: { label: string; value: ReactNode; note: string; tone?: "success" | "warning" | "danger"; href?: string }) {
  const body = (
    <>
      <span className="text-[13px] font-semibold text-[#5b6372]">{label}</span>
      <span className={cn("text-[26px] leading-tight font-bold tabular-nums", tone === "success" ? "text-[#166534]" : tone === "warning" ? "text-[#8a4b06]" : tone === "danger" ? "text-[#a61b1b]" : "text-ink-900")}>{value}</span>
      <span className="text-xs text-[#5b6372]">{note}</span>
    </>
  );
  const box = "flex min-w-0 flex-1 basis-40 flex-col gap-0.5 rounded-xl border border-hairline bg-white px-4 py-3";
  return href ? <Link href={href} className={cn(box, "hover:border-ink-400")}>{body}</Link> : <div className={box}>{body}</div>;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const countAndKobo = (x: { count: number; kobo: number }) => (x.count ? `${x.count} · ${formatNaira(x.kobo)}` : "0");

/**
 * Payments (design R107): today's takings as tiles, Today | Mine for the front desk, method chips, then the list.
 * `view` "all" is the manager's list of every payment (no Today/Mine), paged.
 */
export function FrontDeskPayments({
  view,
  rows,
  summary,
  staffId,
  basePath,
  reservationHref,
  receiptHref = (n) => `/app/payments/receipt/${n}`,
  confirmHref,
  pager,
}: {
  view: "today" | "mine" | "all";
  rows: ListedRow[];
  summary: FrontDeskSummary | null;
  staffId: string;
  basePath: string;
  reservationHref: (p: ListedRow) => string;
  receiptHref?: (n: string) => string;
  /** Payments to confirm, for those who can open it. */
  confirmHref?: string;
  pager?: ReactNode;
}) {
  const t = summary?.totals;
  const taken = t ? t.cash + t.transfer + t.cardOnline + t.pos + t.other : 0;
  const seg = (v: "today" | "mine", label: string) => (
    <Link
      href={v === "today" ? basePath : `${basePath}?view=mine`}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex h-[34px] flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold whitespace-nowrap",
        view === v ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-[#5b6372] hover:text-ink-900",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-3.5">
      {summary && t ? (
        <div className="flex flex-wrap gap-3">
          <Tile label="Taken today" value={formatNaira(taken)} note={plural(summary.todayCount, "payment")} />
          <Tile label="Cash" value={formatNaira(t.cash)} note="in the drawer" tone="success" />
          <Tile label="To confirm" value={countAndKobo(summary.toConfirm)} note="transfer and POS" tone={summary.toConfirm.count ? "warning" : undefined} href={confirmHref} />
          <Tile label="Refunds due" value={countAndKobo(summary.refundsDue)} note="needs the GM" tone={summary.refundsDue.count ? "danger" : undefined} />
        </div>
      ) : null}

      <PaymentList
        leading={
          view !== "all" ? (
            <nav aria-label="Which payments" className="flex w-[200px] gap-1 rounded-lg bg-[#eae7df] p-1">
              {seg("today", "Today")}
              {seg("mine", "Mine")}
            </nav>
          ) : undefined
        }
        rows={rows.map((p) => ({ ...p, href: reservationHref(p), receiptHref: p.receiptNumber ? receiptHref(p.receiptNumber) : undefined }))}
        todayOnly={view === "today"}
        staffId={staffId}
        empty={view === "today" ? "No payments yet today" : view === "mine" ? "You haven't recorded any payments" : "No payments yet"}
        footer={pager}
      />

      {view !== "all" ? (
        <p className="text-sm text-[#5b6372]">
          Older payments are in Reports, which managers can open. To find a guest&apos;s past payment, open their booking.
        </p>
      ) : null}
    </div>
  );
}
