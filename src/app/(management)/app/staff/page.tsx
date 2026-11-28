import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles } from "@/components/ui/button";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { StaffAccess } from "@/components/management/staff-access";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { hotelToday } from "@/server/queries/reservations";
import { listStaff } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Staff & access" };

export default function StaffPage(props: PageProps<"/app/staff">) {
  return (
    <Suspense fallback={<><PageHeader title="Staff & access" description="Invite staff, change roles, remove access" /><LoadingState /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "staff.manage")) return <AccessDenied />;
  const [team, today, sp] = await Promise.all([listStaff(), hotelToday(), searchParams]);
  return (
    <>
      <PageHeader
        title="Staff & access"
        description="Invite staff, change roles, remove access"
        actions={<Link href="/app/staff?invite=1" scroll={false} className={buttonStyles()}>Invite someone</Link>}
      />
      <div className="px-4 py-5 lg:px-8">
        <StaffAccess rows={team} selfId={staff.id} today={today} inviteOpen={sp.invite === "1"} />
      </div>
    </>
  );
}
