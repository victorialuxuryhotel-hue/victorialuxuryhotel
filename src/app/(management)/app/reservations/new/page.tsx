import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { ReservationForm } from "@/components/management/reservation-form";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { bookingTonight } from "@/server/queries/reservations";
import { listCategories } from "@/server/queries/rooms";
import { getBookingRules } from "@/server/queries/settings";

export const metadata: Metadata = { title: "New booking" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const [categories, today, rules] = await Promise.all([listCategories(), bookingTonight(), getBookingRules()]);
  return <ReservationForm categories={categories} today={today} holdHours={rules.staffHoldHours} aboveTabs={staff.role === "front_desk"} />;
}

export default function NewReservationPage() {
  return (
    <>
      <PageHeader title="New booking" description="Walk-in, phone or WhatsApp bookings." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
