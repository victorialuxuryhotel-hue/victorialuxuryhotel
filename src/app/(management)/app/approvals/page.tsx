import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { ApprovalsTable } from "@/components/management/approvals";
import { PageHeader } from "@/components/management/page-header";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils/cn";
import { actorOf, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { listApprovals, waitingCount, type ApprovalState } from "@/server/domain/approvals";

export const metadata: Metadata = { title: "Approvals" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "payments.approve")) return <AccessDenied />;
  const tab = (await searchParams).tab;
  const state: ApprovalState = tab === "approved" || tab === "declined" ? tab : "waiting";
  const db = await getDb();
  const [rows, waiting] = await Promise.all([listApprovals(db, actorOf(staff), state), waitingCount(db)]);
  const tabs: [ApprovalState, string][] = [["waiting", `Waiting · ${waiting}`], ["approved", "Approved"], ["declined", "Declined"]];
  return (
    <div className="space-y-4 px-4 py-6 lg:px-8">
      <nav aria-label="Approvals" className="flex gap-5 border-b border-hairline">
        {tabs.map(([t, label]) => (
          <Link key={t} href={t === "waiting" ? "/app/approvals" : `/app/approvals?tab=${t}`} aria-current={t === state ? "page" : undefined}
            className={cn("-mb-px border-b-[3px] px-0.5 pb-2.5 text-[15px] font-semibold", t === state ? "border-navy-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>
            {label}
          </Link>
        ))}
      </nav>
      <ApprovalsTable rows={rows} state={state} selfName={staff.fullName} />
    </div>
  );
}

export default function ApprovalsPage(props: PageProps<"/app/approvals">) {
  return (
    <>
      <PageHeader title="Approvals" description="Refunds and exceptions waiting for you." />
      <Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense>
    </>
  );
}
