import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { staffRole } from "@/domain/status";
import { requireStaff } from "@/server/auth";
import { AccountSecurity } from "./account-security";
import { FirstDayChecklist } from "@/components/management/first-day";
import { firstDay } from "@/content/help";
import { actorOf } from "@/server/auth";
import { getDb } from "@/server/db";
import { firstDayTicks } from "@/server/domain/first-day";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<PageHeader title="Your account" />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  const staff = await requireStaff();
  const list = staff.viewAs ? undefined : firstDay[staff.role];
  const done = list ? await firstDayTicks(await getDb(), actorOf(staff)) : [];
  const showFirstDay = list && list.some((i) => !done.includes(i.key));
  return (
    <>
      <PageHeader title="Your account" description={`${staff.fullName} · ${staffRole[staff.role]} · ${staff.email}`} />
      <div className="px-4 py-6 lg:px-8">
        <div className="max-w-5xl space-y-6">
          {showFirstDay ? <FirstDayChecklist items={list} done={done} /> : null}
          <AccountSecurity />
        </div>
      </div>
    </>
  );
}
