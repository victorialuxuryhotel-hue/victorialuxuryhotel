import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { SettingsSection } from "@/components/management/settings";
import { BookingRulesForm, PaymentDetailsForm } from "@/components/management/settings-forms";
import { getDb } from "@/server/db";
import { paymentSettings } from "@/server/domain/payment-details";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { ExtrasManager, PromoManager } from "@/components/management/booking-extras";
import { getBookingRules, getCatalogueSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Booking rules" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Booking rules" description="Check-in times, holds, cancellations and VAT." />
      <Suspense fallback={<LoadingState />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const staff = await requireStaff();
  if (!can(staff.role, "settings.manage")) return <AccessDenied />;
  const [rules, catalogue, pay] = await Promise.all([getBookingRules(), getCatalogueSettings(), getDb().then(paymentSettings)]);
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <SettingsSection title="Booking rules" description="Changes apply to new bookings.">
        <BookingRulesForm rules={rules} />
      </SettingsSection>
      <SettingsSection title="Payment details" description="The hotel's bank account for transfers, and the POS terminals.">
        <PaymentDetailsForm value={pay} />
      </SettingsSection>
      <SettingsSection title="Extras" description="Guests can add these when they book online.">
        <ExtrasManager extras={catalogue.extras} />
      </SettingsSection>
      <SettingsSection title="Promo codes" description="Percent off the room price when a guest enters the code.">
        <PromoManager promos={catalogue.promos} />
      </SettingsSection>
    </div>
  );
}
