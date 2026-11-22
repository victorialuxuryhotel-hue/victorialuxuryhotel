import { PageHeader } from "@/components/management/page-header";
import { ActivityList, SettingsSection, StaffTable } from "@/components/management/settings";
import { BookingRulesForm, InviteStaffForm, StaffAccessForm } from "@/components/management/settings-forms";
import { activity, staff } from "../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Booking rules" description="Booking rules and the activity log." />
      <div className="space-y-6 px-4 py-6 lg:px-8">
        <SettingsSection title="Staff" description="Only the owner can invite, change roles or deactivate staff.">
          <InviteStaffForm />
          <div className="border-t border-ivory-200"><StaffTable rows={staff} manage={(s) => <StaffAccessForm staffId={s.id} role={s.role} isActive={s.isActive} isSelf={s.id === "s1"} />} /></div>
        </SettingsSection>
        <SettingsSection title="Booking rules" description="Managers can change these at any time."><BookingRulesForm rules={{ checkInTime: "14:00", checkOutTime: "12:00", websiteHoldMinutes: 30, staffHoldHours: 24, cancellationPolicy: null }} /></SettingsSection>
        <SettingsSection title="Activity log" description="Every important staff and system action. Read-only."><ActivityList rows={activity} /></SettingsSection>
      </div>
    </>
  );
}
