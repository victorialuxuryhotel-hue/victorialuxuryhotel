import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { CloseDayForm, SignOffForm } from "@/components/management/closing-forms";
import { PageHeader } from "@/components/management/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { addDays, businessDate, businessDaySql } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { all, getDb } from "@/server/db";
import { closingSummary, listClosings, type ClosingSummary } from "@/server/domain/pos";

export const metadata: Metadata = { title: "Daily closing" };

function Summary({ s }: { s: ClosingSummary }) {
  const line = (label: string, value: string, strong = false) => (
    <div className={cn("flex justify-between gap-4 py-1.5", strong && "font-semibold text-ink-900")}><dt className="text-ink-600">{label}</dt><dd className="tabular-nums">{value}</dd></div>
  );
  return (
    <dl className="grid gap-x-10 text-sm sm:grid-cols-2">
      <div>
        {line("Completed sales", `${s.sales} · ${formatNaira(s.salesKobo)}`, true)}
        {line("Cash", formatNaira(s.byMethod.cash))}
        {line("Transfer", formatNaira(s.byMethod.bank_transfer))}
        {line("POS / card", formatNaira(s.byMethod.pos_terminal))}
      </div>
      <div>
        {line("Voided sales", `${s.voids} · ${formatNaira(s.voidsKobo)}`)}
        {line("Unpaid orders", String(s.openOrders))}
        {line("Cash expected", formatNaira(s.byMethod.cash), true)}
      </div>
    </dl>
  );
}

async function Content() {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["pos.sell", "pos.view"])) return <AccessDenied />;
  const reader = await authorizeRead(["pos.sell", "pos.view"]);
  const actor = actorOf(reader);
  const db = await getDb();
  const today = businessDate();
  const seller = can(staff.role, "pos.sell");
  const viewer = can(staff.role, "pos.view");
  const [mine, closings, notClosed] = await Promise.all([
    seller ? closingSummary(db, actor, staff.id) : Promise.resolve(null),
    listClosings(db, actor, addDays(today, -13), today),
    viewer
      ? all<{ name: string; kobo: number }>(
          db,
          `SELECT s.full_name AS name, sum(o.total_kobo) AS kobo FROM pos_orders o JOIN staff_profiles s ON s.id = o.paid_by
           WHERE o.status = 'paid' AND ${businessDaySql("o.paid_at")} = ? AND NOT EXISTS (SELECT 1 FROM pos_closings c WHERE c.staff_id = o.paid_by AND c.business_date = ?)
           GROUP BY o.paid_by ORDER BY s.full_name`,
          today, today,
        )
      : Promise.resolve([]),
  ]);
  const myClosing = closings.find((c) => c.staff_id === staff.id && c.business_date === today);
  const canSign = can(staff.role, "pos.manage");
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      {seller && mine ? (
        <Card>
          <CardHeader title={`Your day · ${formatDate(today)}`} description={myClosing ? "Closed." : "Count the cash in your drawer, then close your day."} />
          <div className="space-y-5 p-5">
            <Summary s={myClosing ? (JSON.parse(myClosing.summary) as ClosingSummary) : mine} />
            {myClosing ? (
              <p className="text-sm text-ink-700">
                You counted <b className="tabular-nums">{formatNaira(myClosing.counted_cash_kobo)}</b> at {formatDateTime(myClosing.closed_at)}.{" "}
                {myClosing.verified_at ? `Signed off by ${myClosing.verified_by_name}.` : "Waiting for a manager to sign it off."}
              </p>
            ) : (
              <CloseDayForm expectedCashKobo={mine.byMethod.cash} openOrders={mine.openOrders} />
            )}
          </div>
        </Card>
      ) : null}

      {viewer && notClosed.length ? (
        <p role="status" className="rounded-md border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          Not closed yet today: {notClosed.map((n) => `${n.name} (${formatNaira(n.kobo)})`).join(", ")}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Closings · last 14 days" description={viewer ? "Every salesperson's cash count against the till." : "Your closings."} />
        {closings.length ? (
          <ul className="divide-y divide-hairline">
            {closings.map((c) => {
              const s = JSON.parse(c.summary) as ClosingSummary;
              const diff = c.counted_cash_kobo - c.expected_cash_kobo;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-ink-900">{formatDate(c.business_date)} · {c.staff}</p>
                    <p className="text-xs text-ink-500">
                      Sold {formatNaira(s.salesKobo)} · cash expected {formatNaira(c.expected_cash_kobo)}, counted {formatNaira(c.counted_cash_kobo)}
                      {c.explanation ? ` · “${c.explanation}”` : ""}
                      {c.verified_at ? ` · signed off by ${c.verified_by_name}${c.verify_note ? `: ${c.verify_note}` : ""}` : ""}
                    </p>
                  </div>
                  <Badge tone={diff === 0 ? "success" : "danger"}>{diff === 0 ? "Matches" : `${formatNaira(Math.abs(diff))} ${diff < 0 ? "short" : "over"}`}</Badge>
                  {c.verified_at ? <Badge tone="brand">Signed off</Badge> : canSign && (c.staff_id !== staff.id || staff.role === "owner") ? <SignOffForm id={c.id} /> : <Badge tone="warning">Waiting for sign-off</Badge>}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5"><EmptyState title="No closings yet" /></div>
        )}
      </Card>
    </div>
  );
}

export default function ClosingPage() {
  return (
    <>
      <PageHeader title="Daily closing" description="Count the cash, compare it with the till, and sign the day off." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
