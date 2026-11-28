import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "@/lib/utils/cn";
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

type Tab = "rules" | "payments" | "extras" | "promos";
const TABS: [Tab, string][] = [["rules", "Rules"], ["payments", "Payment details"], ["extras", "Extras"], ["promos", "Promo codes"]];

export default function SettingsPage(props: PageProps<"/app/settings">) {
  return (
    <Suspense fallback={<><PageHeader title="Booking rules" description="Changes apply to new bookings" /><LoadingState /></>}>
      <SettingsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SettingsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "settings.manage")) return <AccessDenied />;
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.some(([t]) => t === raw) ? (raw as Tab) : "rules";
  const [rules, catalogue, pay] = await Promise.all([getBookingRules(), getCatalogueSettings(), getDb().then(paymentSettings)]);
  return (
    <>
      <PageHeader title="Booking rules" description="Changes apply to new bookings" />
      <nav aria-label="Booking rules" className="mx-4 mt-4 flex gap-6 overflow-x-auto border-b border-hairline lg:mx-8">
        {TABS.map(([t, label]) => (
          <Link
            key={t}
            href={t === "rules" ? "/app/settings" : `/app/settings?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn("-mb-px shrink-0 border-b-[3px] px-0.5 pb-2.5 text-[15px] font-semibold whitespace-nowrap", t === tab ? "border-navy-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-4 py-4 lg:px-8">
        {tab === "rules" ? <BookingRulesForm rules={rules} /> : null}
        {tab === "payments" ? (
          <SettingsSection title="Payment details" description="The hotel's bank account for transfers, and the POS terminals.">
            <div className="p-5"><PaymentDetailsForm value={pay} /></div>
          </SettingsSection>
        ) : null}
        {tab === "extras" ? (
          <SettingsSection title="Extras" description="Guests can add these when they book online.">
            <ExtrasManager extras={catalogue.extras} />
          </SettingsSection>
        ) : null}
        {tab === "promos" ? (
          <SettingsSection title="Promo codes" description="Percent off the room price when a guest enters the code.">
            <PromoManager promos={catalogue.promos} />
          </SettingsSection>
        ) : null}
      </div>
    </>
  );
}
