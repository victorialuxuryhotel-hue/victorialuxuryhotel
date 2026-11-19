import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { ActivityList, SettingsSection, StaffTable } from "@/components/management/settings";
import { BookingRulesForm, InviteStaffForm, StaffAccessForm } from "@/components/management/settings-forms";
import { buttonStyles } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getBookingRules, listStaff, recentActivity } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Staff access, booking rules and the activity log." />
      <Suspense fallback={<LoadingState />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const staff = await requireStaff();
  const manageStaff = can(staff.role, "staff.manage");
  const manageRules = can(staff.role, "settings.manage");
  if (!manageStaff && !manageRules) return <AccessDenied />;

  const [rules, team, activity] = await Promise.all([
    manageRules ? getBookingRules() : null,
    manageStaff ? listStaff() : null,
    can(staff.role, "activity.view") ? recentActivity() : null,
  ]);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
        {team ? (
          <SettingsSection title="Staff" description="Invite staff, change roles or remove access. Only the owner can do this.">
            <InviteStaffForm />
            <div className="border-t border-ivory-200">
              <StaffTable rows={team} manage={(s) => <StaffAccessForm staffId={s.id} role={s.role} isActive={s.isActive} isSelf={s.id === staff.id} />} />
            </div>
          </SettingsSection>
        ) : null}
        {manageRules ? (
          <SettingsSection title="Website" description="Photos and room types shown to guests.">
            <div className="flex flex-wrap gap-3 p-5">
              <Link href="/app/settings/photos" className={buttonStyles({ variant: "secondary" })}>Website photos</Link>
              <Link href="/app/rooms/categories" className={buttonStyles({ variant: "secondary" })}>Room types, rates &amp; photos</Link>
            </div>
          </SettingsSection>
        ) : null}
        {rules ? (
          <SettingsSection title="Booking rules" description="Changes apply to new bookings and are recorded in the activity log.">
            <BookingRulesForm rules={rules} />
          </SettingsSection>
        ) : null}
        {activity ? (
          <SettingsSection title="Activity log" description="Important staff and system actions, newest first. Read-only.">
            <ActivityList rows={activity} />
          </SettingsSection>
        ) : null}
    </div>
  );
}
