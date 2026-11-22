import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { SettingsSection, StaffTable } from "@/components/management/settings";
import { InviteStaffForm, StaffAccessForm } from "@/components/management/settings-forms";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
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
  const team = await listStaff();
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <SettingsSection title="Invite someone" description="They get an email to set a password, then sign in with the role you choose.">
        <InviteStaffForm />
      </SettingsSection>
      <SettingsSection title="Team" description="Only the owner can change roles or remove access.">
        <StaffTable rows={team} manage={(s) => <StaffAccessForm staffId={s.id} role={s.role} isActive={s.isActive} isSelf={s.id === staff.id} phone={s.phone} />} />
      </SettingsSection>
    </div>
  );
}
