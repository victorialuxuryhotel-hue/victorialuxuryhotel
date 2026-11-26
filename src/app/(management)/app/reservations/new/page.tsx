import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { ReservationForm } from "@/components/management/reservation-form";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { bookingTonight } from "@/server/queries/reservations";
import { listCategories, roomToAskFor } from "@/server/queries/rooms";
import { isIsoDate } from "@/lib/hotel-date";
import { recordId } from "@/lib/ids";
import { getBookingRules } from "@/server/queries/settings";

export const metadata: Metadata = { title: "New booking" };

type Search = Promise<{ type?: string | string[]; checkIn?: string | string[]; room?: string | string[] }>;

async function Content({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const [categories, today, rules] = await Promise.all([listCategories(), bookingTonight(), getBookingRules()]);
  // From Today's "Available tonight" (type) or an empty night on the calendar (type, date, room).
  const sp = await searchParams;
  const initialType = categories.find((c) => c.isActive && c.id === sp.type)?.id;
  const initialCheckIn = typeof sp.checkIn === "string" && isIsoDate(sp.checkIn) && sp.checkIn >= today ? sp.checkIn : undefined;
  const room = typeof sp.room === "string" && recordId().safeParse(sp.room).success ? await roomToAskFor(sp.room) : null;
  const preferredRoom = room && room.categoryId === initialType ? room : undefined;
  return <ReservationForm categories={categories} today={today} initialCategoryId={initialType} initialCheckIn={initialCheckIn} preferredRoom={preferredRoom} holdHours={rules.staffHoldHours} aboveTabs={staff.role === "front_desk"} />;
}

export default function NewReservationPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="New booking" description="Walk-in, phone or WhatsApp bookings." />
      <Suspense fallback={<LoadingState />}><Content searchParams={searchParams} /></Suspense>
    </>
  );
}
