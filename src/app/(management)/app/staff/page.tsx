import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { StaffAccess } from "@/components/management/staff-access";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { hotelToday } from "@/server/queries/reservations";
import { listStaff } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Staff & access" };

/** Owner only: who can sign in, and with which role. */
export default function StaffPage() {
  return (
    <>
      <PageHeader title="Staff & access" description="Invite staff, change roles or remove access." />
      <Suspense fallback={<LoadingState />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "staff.manage")) return <AccessDenied />;
  const [team, today] = await Promise.all([listStaff(), hotelToday()]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8">
      <StaffAccess rows={team} selfId={staff.id} today={today} />
    </div>
  );
}
