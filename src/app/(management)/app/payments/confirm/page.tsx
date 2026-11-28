import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { ConfirmButtons } from "@/components/management/payment-checks";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { paymentsToConfirm } from "@/server/domain/payment-checks";
import { openPaymentIssues } from "@/server/domain/payment-details";
import { CloseIssueForm } from "@/components/management/payment-checks";

export const metadata: Metadata = { title: "Payments to confirm" };

const METHOD = { bank_transfer: "Transfer", pos_terminal: "POS / card" } as const;

async function Content() {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["payments.approve", "reports.view"])) return <AccessDenied />;
  const reader = await authorizeRead(["payments.approve", "reports.view"]);
  const db = await getDb();
  const [rows, issues] = await Promise.all([paymentsToConfirm(db, actorOf(reader)), openPaymentIssues(db, actorOf(reader))]);
  const canConfirm = can(staff.role, "payments.approve");
  const total = rows.reduce((t, r) => t + r.amount_kobo, 0);
  return (
    <div className="space-y-4 px-4 py-6 lg:px-8">
      {issues.length ? (
        <section aria-labelledby="bank-check" className="space-y-2">
          <h2 id="bank-check" className="text-base font-bold text-ink-900">Check with the bank · {issues.length}</h2>
          <p className="text-sm text-ink-600">POS payments that were declined but the customer says they were debited. Nothing was recorded. Ask the bank or terminal provider whether the money arrived.</p>
          <Card>
            <ul className="divide-y divide-hairline">
              {issues.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start gap-x-5 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-ink-900">
                      {formatNaira(i.amount_kobo)} · {i.label}
                      {i.slip_last4 ? <span className="text-sm text-ink-700"> · slip {i.slip_last4}</span> : null}
                      {i.terminal ? <span className="text-sm text-ink-700"> · {i.terminal}</span> : null}
                    </p>
                    <p className="text-xs text-ink-500">{formatDateTime(i.reported_at)} · reported by {i.reported_by_name ?? "staff"}</p>
                  </div>
                  {canConfirm && i.reported_by !== staff.id ? (
                    <CloseIssueForm id={i.id} recordHref={i.source_type === "reservation" ? `/app/payments/record?reservation=${i.source_id}` : `/app/sales?resume=${i.source_id}`} />
                  ) : canConfirm ? (
                    <p className="text-sm text-ink-500">You reported this, so another manager or the owner checks it.</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
      <p className="text-sm text-ink-600">
        {rows.length ? `${rows.length} payment${rows.length === 1 ? "" : "s"} · ${formatNaira(total)} to check.` : null}{" "}
        Check transfers against the hotel&apos;s bank statement and POS payments against the card terminal&apos;s report.
        {canConfirm ? "" : " Only the General Manager or the Owner confirms them."}
      </p>
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <li key={`${r.source_type}:${r.source_id}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink-900">
                    {formatNaira(r.amount_kobo)} · {METHOD[r.method]}
                    {r.reference ? <span className="text-sm text-ink-700"> · {r.method === "pos_terminal" ? `slip …${r.reference}` : r.reference}</span> : null}
                  </p>
                  <p className="text-xs text-ink-500">{formatDateTime(r.at)} · {r.who} · taken by {r.taken_by ?? "staff"}</p>
                </div>
                {canConfirm && r.taken_by_id === staff.id ? (
                  <p className="text-sm text-ink-500">You recorded this, so another manager or the owner confirms it.</p>
                ) : canConfirm ? (
                  <ConfirmButtons sourceType={r.source_type} sourceId={r.source_id} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState title="Nothing to confirm" description="Every transfer and POS payment has been checked." /></div>
        )}
      </Card>
    </div>
  );
}

export default function PaymentsToConfirmPage() {
  return (
    <>
      <PageHeader title="Payments to confirm" description="Tick off each transfer and POS payment against the statement or terminal report." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
