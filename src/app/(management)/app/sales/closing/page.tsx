import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { CloseDayForm, MarkChecked } from "@/components/management/closing-forms";
import { PageHeader } from "@/components/management/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Kpi } from "@/components/ui/choice";
import { LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { formatDateTime, formatNaira } from "@/lib/format";
import { addDays, businessDate } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { closingSummary, closingsReview, listClosings, OUTLETS, type ClosingRow, type ClosingSummary, type Outlet } from "@/server/domain/pos";

export const metadata: Metadata = { title: "Daily closing" };

const shortDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const counter = (outlets: string | null) => (outlets ? outlets.split(",").map((o) => OUTLETS[o as Outlet] ?? o).join(" & ") : "—");
const signed = (kobo: number) => (kobo === 0 ? formatNaira(0) : `${kobo < 0 ? "−" : "+"}${formatNaira(Math.abs(kobo))}`);
const Count = ({ n }: { n: number }) => <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-2 text-[13px] font-semibold tabular-nums text-ink-700">{n}</span>;

function ClosingsTable({ rows, title, markFor }: { rows: ClosingRow[]; title: string; markFor: (c: ClosingRow) => boolean }) {
  return (
    <section className="overflow-clip rounded-xl border border-hairline bg-white">
      <h2 className="flex items-center gap-2.5 border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">{title} <Count n={rows.length} /></h2>
      {rows.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-[13px] text-ink-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Day</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Who</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Counter</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Counted</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Expected</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Difference</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Their note</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((c) => {
                const diff = c.counted_cash_kobo - c.expected_cash_kobo;
                const s = JSON.parse(c.summary) as ClosingSummary;
                return (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-900">{shortDay(c.business_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[11px] font-bold text-navy-800">{initials(c.staff)}</span>
                        <span className="font-semibold text-ink-900">{c.staff}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-700">{counter(c.outlets)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-900" title={`Sold ${formatNaira(s.salesKobo)} · closed ${formatDateTime(c.closed_at)}`}>{formatNaira(c.counted_cash_kobo)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-900">{formatNaira(c.expected_cash_kobo)}</td>
                    <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums", diff < 0 ? "text-[#a61b1b]" : diff > 0 ? "text-[#8a4b06]" : "text-[#166534]")}>
                      {signed(diff)}
                      <span className="sr-only">{diff < 0 ? " short" : diff > 0 ? " over" : " nil"}</span>
                    </td>
                    <td className="max-w-56 px-4 py-2.5 text-ink-700">{c.explanation ?? ""}</td>
                    <td className="px-4 py-2.5">
                      {c.verified_at ? <Badge tone="success">Checked</Badge> : <Badge tone="warning">To check</Badge>}
                      {c.verified_at ? <p className="mt-1 text-xs text-ink-500">{c.verified_by_name}{c.verify_note ? `: ${c.verify_note}` : ""}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right">{!c.verified_at && markFor(c) ? <MarkChecked id={c.id} needsNote={diff !== 0} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 py-6 text-sm text-ink-500">No closings in the last 14 days.</p>}
    </section>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["pos.sell", "pos.view"])) return <AccessDenied />;
  const reader = await authorizeRead(["pos.sell", "pos.view"]);
  const actor = actorOf(reader);
  const db = await getDb();
  const today = businessDate();
  const seller = can(staff.role, "pos.sell");
  const viewer = can(staff.role, "pos.view");
  const mineOnly = seller && (!viewer || (await searchParams).mine === "1");

  if (mineOnly) {
    const [mine, closings] = await Promise.all([closingSummary(db, actor, staff.id), listClosings(db, actor, addDays(today, -13), today)]);
    const own = closings.filter((c) => c.staff_id === staff.id);
    const closed = own.find((c) => c.business_date === today);
    return (
      <>
        <PageHeader
          title="Daily closing"
          description="Count your cash and close your day"
          actions={viewer ? <Link href="/app/sales/closing" className={buttonStyles({ variant: "secondary" })}>All closings</Link> : null}
        />
        <div className="space-y-6 px-4 py-5 lg:px-8">
          {closed ? (
            <section className="max-w-xl space-y-2 rounded-xl border border-hairline bg-white p-5">
              <h2 className="text-xl font-bold text-ink-900">Your day is closed</h2>
              <p className="text-sm text-ink-700">
                You counted <b className="tabular-nums">{formatNaira(closed.counted_cash_kobo)}</b> at {formatDateTime(closed.closed_at)}; the till expected{" "}
                <b className="tabular-nums">{formatNaira(closed.expected_cash_kobo)}</b>.{" "}
                {closed.verified_at ? `Checked by ${closed.verified_by_name}.` : "Waiting for a manager to check it."}
              </p>
            </section>
          ) : (
            <CloseDayForm who={staff.fullName} day={shortDay(today)} openOrders={mine.openOrders} />
          )}
          <ClosingsTable rows={own} title="Your closings" markFor={() => false} />
        </div>
      </>
    );
  }

  const review = await closingsReview(db, actor);
  const canCheck = can(staff.role, "pos.manage");
  return (
    <>
      <PageHeader
        title="Daily closings"
        description="Each person's count against what the system expected"
        actions={seller ? <Link href="/app/sales/closing?mine=1" className={buttonStyles({ variant: "secondary" })}>Close my day</Link> : null}
      />
      <div className="space-y-4 px-4 py-5 lg:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi label="To check" value={review.toCheck} note={review.toCheck === 1 ? "closing" : "closings"} tone={review.toCheck ? "warning" : undefined} />
          <Kpi label="Short this week" value={signed(review.short.kobo)} note={review.short.n === 1 ? "1 closing" : `${review.short.n} closings`} tone={review.short.kobo ? "danger" : undefined} />
          <Kpi label="Over this week" value={signed(review.over.kobo)} note={review.over.n === 1 ? "1 closing" : `${review.over.n} closings`} />
          <Kpi
            label="Not closed"
            value={review.notClosed.length}
            note={review.notClosed.length ? `yesterday: ${review.notClosed.map((n) => `${n.name} (${formatNaira(n.kobo)})`).join(", ")}` : "yesterday"}
            tone={review.notClosed.length ? "danger" : undefined}
          />
        </div>
        <ClosingsTable rows={review.rows} title="Closings" markFor={(c) => canCheck && c.staff_id !== staff.id} />
      </div>
    </>
  );
}

export default function ClosingPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<><PageHeader title="Daily closing" /><LoadingState /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
