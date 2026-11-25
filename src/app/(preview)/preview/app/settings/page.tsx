import { PageHeader } from "@/components/management/page-header";
import { ActivityList, SettingsSection } from "@/components/management/settings";
import { BookingRulesForm } from "@/components/management/settings-forms";
import { StaffAccess } from "@/components/management/staff-access";
import { activity, staff } from "../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Booking rules" description="Check-in times, holds, cancellations and VAT." />
      <div className="space-y-6 px-4 py-6 lg:px-8">
        <StaffAccess rows={staff} selfId="s1" today="2026-12-01" />
        <SettingsSection title="Booking rules" description="Managers can change these at any time."><BookingRulesForm rules={{ checkInTime: "14:00", checkOutTime: "12:00", websiteHoldMinutes: 30, staffHoldHours: 24, cancellationPolicy: null, freeCancelHours: 48, lateCancelFeePct: 50, vatRateBp: 750, vatOnReceipts: false }} /></SettingsSection>
        <SettingsSection title="Activity log" description="Every important staff and system action. Read-only."><ActivityList rows={activity} /></SettingsSection>
      </div>
    </>
  );
}
