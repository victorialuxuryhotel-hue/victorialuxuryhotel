import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { ReservationForm } from "@/components/management/reservation-form";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { hotelToday } from "@/server/queries/reservations";
import { listCategories } from "@/server/queries/rooms";
import { getBookingRules } from "@/server/queries/settings";

export const metadata: Metadata = { title: "New reservation" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const [categories, today, rules] = await Promise.all([listCategories(), hotelToday(), getBookingRules()]);
  return <ReservationForm categories={categories} today={today} holdHours={rules.staffHoldHours} />;
}

export default function NewReservationPage() {
  return (
    <>
      <PageHeader title="New reservation" description="Walk-in, phone or WhatsApp. Uses the same availability and pricing as the website." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
