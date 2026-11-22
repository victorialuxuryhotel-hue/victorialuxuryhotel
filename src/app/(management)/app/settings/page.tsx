import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { SettingsSection } from "@/components/management/settings";
import { BookingRulesForm } from "@/components/management/settings-forms";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getBookingRules } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Booking rules" };

/** How bookings and holds work. Staff moved to /app/staff, room types and photos to Rates & room types, the activity log to Reports. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Booking rules" description="How online and phone bookings are held and paid for." />
      <Suspense fallback={<LoadingState />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const staff = await requireStaff();
  if (!can(staff.role, "settings.manage")) return <AccessDenied />;
  const rules = await getBookingRules();
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <SettingsSection title="Booking rules" description="Changes apply to new bookings and are recorded in the activity log.">
        <BookingRulesForm rules={rules} />
      </SettingsSection>
    </div>
  );
}
