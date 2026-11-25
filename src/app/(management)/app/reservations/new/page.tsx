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

async function Content({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const [categories, today, rules] = await Promise.all([listCategories(), bookingTonight(), getBookingRules()]);
  // From Today's "Available tonight": the room type comes chosen (only if it's one that can be booked).
  const { type } = await searchParams;
  const initialType = categories.find((c) => c.isActive && c.id === type)?.id;
  return <ReservationForm categories={categories} today={today} initialCategoryId={initialType} holdHours={rules.staffHoldHours} aboveTabs={staff.role === "front_desk"} />;
}

export default function NewReservationPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  return (
    <>
      <PageHeader title="New booking" description="Walk-in, phone or WhatsApp bookings." />
      <Suspense fallback={<LoadingState />}><Content searchParams={searchParams} /></Suspense>
    </>
  );
}
