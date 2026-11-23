import Link from "next/link";
import type { FrontDeskSummary } from "@/server/domain/payment-list";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { paymentMethod } from "@/domain/status";
import type { PaymentRow } from "@/domain/views";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { PaymentBadge } from "./badges";

type Row = PaymentRow & { at: string; recordedById?: string; kind: "payment" | "refund" };

const TZ = "Africa/Lagos";
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

export function FrontDeskPayments({
  view,
  rows,
  summary,
  staffId,
  basePath,
  reservationHref,
}: {
  view: "today" | "mine";
  rows: Row[];
  summary: FrontDeskSummary;
  staffId: string;
  basePath: string;
  reservationHref: (p: Row) => string;
}) {
  const who = (p: Row) =>
    p.provider === "paystack" ? "Website" : p.recordedById === staffId ? "You" : (p.recordedBy?.split(" ")[0] ?? "Staff");
  const t = summary.totals;
  const takings: Array<[string, number]> = [
    ["Cash in drawer", t.cash],
    ["Transfer", t.transfer],
    ["Card online", t.cardOnline],
    ...(t.pos ? ([["POS card", t.pos]] as Array<[string, number]>) : []),
    ...(t.other ? ([["Other", t.other]] as Array<[string, number]>) : []),
  ];
  const tab = (v: "today" | "mine", label: string, count: string) => (
    <Link
      href={v === "today" ? basePath : `${basePath}?view=mine`}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex min-h-13 flex-1 flex-col items-center justify-center px-2 py-1.5 text-center",
        view === v ? "text-navy-800 shadow-[inset_0_0_0_1px_var(--color-navy-800)]" : "text-ink-900 hover:bg-ink-900/7",
      )}
    >
      <span className="text-sm">{label}</span>
      <span className="text-xs text-ink-500 tabular-nums">{count}</span>
    </Link>
  );

  return (
    <div className="space-y-5">
      <nav aria-label="Which payments" className="flex overflow-hidden rounded-md border border-hairline [&>*+*]:border-l [&>*+*]:border-hairline sm:max-w-md">
        {tab("today", "Today", `${summary.todayCount} ${summary.todayCount === 1 ? "payment" : "payments"} today`)}
        {tab("mine", "Recorded by me", `${summary.mineCount} all time`)}
      </nav>

      {view === "today" ? (
        <Card>
          <CardHeader title="Today's takings" description="Money received today, after any corrections." />
          <dl className="grid grid-cols-2 gap-px border-t border-hairline bg-hairline sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            {takings.map(([label, kobo]) => (
              <div key={label} className="bg-ivory-50 px-4 py-3.5">
                <dt className="text-xs text-ink-500">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-900">{formatNaira(kobo)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title={view === "today" ? "No payments yet today" : "You haven't recorded any payments"} />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={reservationHref(p)} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-ivory-50 sm:px-5">
                  <span className="truncate text-base text-ink-900">{p.guestName}</span>
                  <span className="text-right text-base font-medium tabular-nums text-ink-900">
                    {p.kind === "refund" ? "−" : ""}
                    {formatNaira(p.amountKobo)}
                  </span>
                  <span className="truncate text-sm text-ink-500 tabular-nums">
                    {p.kind === "refund" ? "Correction" : paymentMethod[p.method]} · {view === "today" ? `${time(p.at)} · ${who(p)}` : dateTime(p.at)}
                  </span>
                  <span className="justify-self-end"><PaymentBadge status={p.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-sm text-ink-500">
        Older payments are in Reports, which managers can open. To find a guest&apos;s past payment, open their reservation.
      </p>
    </div>
  );
}
