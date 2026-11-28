import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { CloseIssueForm, ConfirmButtons } from "@/components/management/payment-checks";
import { Tabs } from "@/components/management/toolbar";
import { Section } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { checkedPayments, paymentsToConfirm, type ToConfirm } from "@/server/domain/payment-checks";
import { openPaymentIssues } from "@/server/domain/payment-details";

export const metadata: Metadata = { title: "Payments to confirm" };

const METHOD = { bank_transfer: "Transfer", pos_terminal: "POS" } as const;
const th = "px-4 py-2.5 text-xs font-semibold text-[#5b6372] whitespace-nowrap";
const td = "px-4 py-2.5 align-middle text-sm text-ink-900";
const reference = (r: ToConfirm) => (r.reference ? (r.method === "pos_terminal" ? `slip ${r.reference}` : r.reference) : "—");

type Tab = "to_confirm" | "matched" | "not_found";

/** Taken, Method, Reference, Taken by, For and Amount (design R108), then whatever the last column holds. */
function PaymentRows({ rows, last, lastHeading }: { rows: ToConfirm[]; last: (r: ToConfirm) => React.ReactNode; lastHeading: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-left tabular-nums">
        <thead className="border-b border-hairline">
          <tr>
            <th scope="col" className={th}>Taken</th>
            <th scope="col" className={th}>Method</th>
            <th scope="col" className={th}>Reference</th>
            <th scope="col" className={th}>Taken by</th>
            <th scope="col" className={th}>For</th>
            <th scope="col" className={cn(th, "text-right")}>Amount</th>
            <th scope="col" className={cn(th, typeof lastHeading === "string" ? "text-left" : "text-right")}>{lastHeading}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1eee8]">
          {rows.map((r) => (
            <tr key={`${r.source_type}:${r.source_id}`}>
              <td className={cn(td, "whitespace-nowrap")}>{formatDateTime(r.at)}</td>
              <td className={td}>{METHOD[r.method]}</td>
              <td className={td}>{reference(r)}</td>
              <td className={td}>{r.taken_by ?? "Staff"}</td>
              <td className={cn(td, "min-w-48")}>{r.who}</td>
              <td className={cn(td, "text-right font-semibold whitespace-nowrap")}>{formatNaira(r.amount_kobo)}</td>
              <td className="w-px px-4 py-1.5 text-right align-middle">{last(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["payments.approve", "reports.view"])) return <AccessDenied />;
  const reader = await authorizeRead(["payments.approve", "reports.view"]);
  const db = await getDb();
  const sp = await searchParams;
  const tab: Tab = sp.tab === "matched" || sp.tab === "not_found" ? sp.tab : "to_confirm";
  const [rows, issues, checked] = await Promise.all([
    paymentsToConfirm(db, actorOf(reader)),
    openPaymentIssues(db, actorOf(reader)),
    tab === "to_confirm" ? Promise.resolve([]) : checkedPayments(db, actorOf(reader), tab),
  ]);
  const canConfirm = can(staff.role, "payments.approve");
  const total = rows.reduce((t, r) => t + r.amount_kobo, 0);
  const href = (t: Tab) => (t === "to_confirm" ? "/app/payments/confirm" : `/app/payments/confirm?tab=${t}`);
  return (
    <div className="space-y-3.5 px-4 py-5 lg:px-7">
      <p className="rounded-[10px] bg-[#e8eefb] px-4 py-3 text-sm text-navy-800">
        Check each one in the bank app or the POS terminal report, never on the customer&apos;s phone. Your check is saved with your name and can&apos;t be changed.
        {canConfirm ? "" : " Only the General Manager or the Owner confirms them."}
      </p>

      {issues.length ? (
        <Section title="Check with the bank" count={issues.length} tone="danger" id="bank-check">
          <p className="border-b border-hairline px-4 py-2.5 text-sm text-ink-700">
            POS payments that were declined but the customer says they were debited. Nothing was recorded. Ask the bank or terminal provider whether the money arrived.
          </p>
          <ul className="divide-y divide-[#f1eee8]">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink-900">
                    {formatNaira(i.amount_kobo)} · {i.label}
                    {i.slip_last4 ? <span className="font-normal text-ink-700"> · slip {i.slip_last4}</span> : null}
                    {i.terminal ? <span className="font-normal text-ink-700"> · {i.terminal}</span> : null}
                  </p>
                  <p className="text-[13px] text-[#5b6372]">{formatDateTime(i.reported_at)} · reported by {i.reported_by_name ?? "staff"}</p>
                </div>
                {canConfirm && i.reported_by !== staff.id ? (
                  <CloseIssueForm id={i.id} recordHref={i.source_type === "reservation" ? `/app/payments/record?reservation=${i.source_id}` : `/app/sales?resume=${i.source_id}`} />
                ) : canConfirm ? (
                  <p className="text-sm text-[#5b6372]">You reported this, so another manager or the owner checks it.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Tabs
        inset={false}
        items={[
          { label: `To confirm · ${rows.length}`, href: href("to_confirm"), active: tab === "to_confirm" },
          { label: "Matched", href: href("matched"), active: tab === "matched" },
          { label: "Not found", href: href("not_found"), active: tab === "not_found" },
        ]}
      />

      {tab === "to_confirm" ? (
        <Section title="Waiting for a check" count={rows.length} action={rows.length ? <span className="text-sm font-semibold tabular-nums text-ink-700">{formatNaira(total)} to check</span> : undefined}>
          {rows.length ? (
            <PaymentRows
              rows={rows}
              lastHeading={<span className="sr-only">Check</span>}
              last={(r) =>
                canConfirm && r.taken_by_id === staff.id ? (
                  <p className="ml-auto w-56 text-left text-[13px] text-[#5b6372]">You recorded this, so another manager or the owner confirms it.</p>
                ) : canConfirm ? (
                  <ConfirmButtons sourceType={r.source_type} sourceId={r.source_id} />
                ) : null
              }
            />
          ) : (
            <div className="p-5"><EmptyState title="Nothing to confirm" description="Every transfer and POS payment has been checked." /></div>
          )}
        </Section>
      ) : (
        <Section title={tab === "matched" ? "Matched" : "Not found"} count={checked.length}>
          {checked.length ? (
            <PaymentRows
              rows={checked}
              lastHeading="Checked"
              last={(r) => {
                const c = checked.find((x) => x.source_type === r.source_type && x.source_id === r.source_id)!;
                return (
                  <span className="block w-64 text-left text-[13px] text-[#5b6372]">
                    {c.checked_by ?? "A manager"} · {formatDateTime(c.checked_at)}
                    {c.note ? <span className="block text-ink-700">{c.note}</span> : null}
                  </span>
                );
              }}
            />
          ) : (
            <div className="p-5"><EmptyState title={tab === "matched" ? "No matched payments yet" : "Nothing marked not found"} /></div>
          )}
        </Section>
      )}
    </div>
  );
}

export default function PaymentsToConfirmPage(props: PageProps<"/app/payments/confirm">) {
  return (
    <>
      <PageHeader title="Payments to confirm" description="Transfers and POS payments to check against the bank" />
      <Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense>
    </>
  );
}
