import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { ExpenseForm, ExpenseList } from "@/components/management/expenses";
import { PageHeader } from "@/components/management/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatNaira } from "@/lib/format";
import { hotelToday } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, listExpenses } from "@/server/domain/finance";
import { reportRange, type ReportRange } from "@/server/domain/reports";

export const metadata: Metadata = { title: "Expenses" };

const ranges: Record<ReportRange, string> = { today: "Today", "14d": "14 days", month: "This month" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "expenses.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const range = typeof sp.range === "string" ? reportRange(sp.range) : "month";
  const reader = await authorizeRead("expenses.manage");
  const today = hotelToday();
  const data = await listExpenses(await getDb(), actorOf(reader), range, today);
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <Card>
        <CardHeader title="Record an expense" description="Mistakes can be voided, not deleted." />
        <ExpenseForm today={today} categories={EXPENSE_CATEGORIES} methods={EXPENSE_METHODS} />
      </Card>
      <nav aria-label="Period" className="flex overflow-hidden rounded-md border border-hairline sm:max-w-sm [&>*+*]:border-l [&>*+*]:border-hairline">
        {(Object.keys(ranges) as ReportRange[]).map((r) => (
          <Link key={r} href={`/app/expenses?range=${r}`} aria-current={r === range ? "page" : undefined}
            className={cn("flex min-h-11 flex-1 items-center justify-center text-sm", r === range ? "text-navy-800 shadow-[inset_0_0_0_1px_var(--color-navy-800)]" : "text-ink-900 hover:bg-ink-900/7")}>
            {ranges[r]}
          </Link>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader title={`Expenses · ${formatNaira(data.totalKobo)}`} />
          <ExpenseList rows={data.rows} categories={EXPENSE_CATEGORIES} />
        </Card>
        <Card>
          <CardHeader title="By category" />
          {data.byCategory.length ? (
            <ul className="divide-y divide-hairline">
              {data.byCategory.map(([c, k]) => (
                <li key={c} className="flex justify-between px-5 py-3 text-sm"><span className="text-ink-700">{EXPENSE_CATEGORIES[c]}</span><span className="tabular-nums text-ink-900">{formatNaira(k)}</span></li>
              ))}
            </ul>
          ) : <p className="px-5 py-4 text-sm text-ink-500">Nothing yet.</p>}
        </Card>
      </div>
    </div>
  );
}

export default function ExpensesPage(props: PageProps<"/app/expenses">) {
  return (
    <>
      <PageHeader title="Expenses" description="What the hotel spends, by category." />
      <Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense>
    </>
  );
}
