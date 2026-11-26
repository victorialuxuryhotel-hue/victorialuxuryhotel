import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { SettingsNav, SettingsSection } from "@/components/management/settings";
import { BookingRulesForm } from "@/components/management/settings-forms";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { ExtrasManager, PromoManager } from "@/components/management/booking-extras";
import { getBookingRules, getCatalogueSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Booking rules" };

const sections = [
  { key: "rules", label: "Booking rules" },
  { key: "extras", label: "Extras" },
  { key: "promos", label: "Promo codes" },
] as const;

export default function SettingsPage(props: PageProps<"/app/settings">) {
  return (
    <>
      <PageHeader title="Settings" description="Booking rules, extras and promo codes." />
      <Suspense fallback={<LoadingState />}>
        <SettingsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function SettingsContent({ searchParams }: { searchParams: PageProps<"/app/settings">["searchParams"] }) {
  const staff = await requireStaff();
  if (!can(staff.role, "settings.manage")) return <AccessDenied />;
  const [rules, catalogue] = await Promise.all([getBookingRules(), getCatalogueSettings()]);
  const requested = (await searchParams).section;
  const active = sections.find((s) => s.key === requested)?.key ?? "rules";
  const links = [
    ...sections.map((s) => ({ label: s.label, href: `/app/settings?section=${s.key}`, current: s.key === active })),
    ...(can(staff.role, "staff.manage") ? [{ label: "Staff & access", href: "/app/staff", current: false }] : []),
    ...(can(staff.role, "categories.manage") ? [{ label: "Website photos", href: "/app/rooms/categories/photos", current: false }] : []),
    ...(can(staff.role, "reports.view") ? [{ label: "Activity", href: "/app/reports?tab=activity", current: false }] : []),
  ];
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:flex-row md:items-start lg:px-8 lg:py-7">
      <SettingsNav links={links} />
      <div className="min-w-0 flex-1">
        {active === "rules" ? (
          <SettingsSection title="Booking rules" description="Changes apply to new bookings.">
            <BookingRulesForm rules={rules} />
          </SettingsSection>
        ) : active === "extras" ? (
          <SettingsSection title="Extras" description="Guests can add these when they book online. Prices include VAT.">
            <ExtrasManager extras={catalogue.extras} />
          </SettingsSection>
        ) : (
          <SettingsSection title="Promo codes" description="Percent off the room price when a guest enters the code.">
            <PromoManager promos={catalogue.promos} />
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
