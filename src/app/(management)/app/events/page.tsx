import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { HallBookingForm, HallBookingList } from "@/components/management/hall-bookings";
import { PageHeader } from "@/components/management/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { hotelToday } from "@/lib/hotel-date";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { listHallBookings } from "@/server/domain/events";

export const metadata: Metadata = { title: "Hall bookings" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "events.manage")) return <AccessDenied />;
  const reader = await authorizeRead("events.manage");
  const today = hotelToday();
  const bookings = await listHallBookings(await getDb(), actorOf(reader), today);
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <Card>
        <CardHeader title="Upcoming" />
        <HallBookingList bookings={bookings} today={today} />
      </Card>
      <Card>
        <CardHeader title="New hall booking" />
        <HallBookingForm today={today} />
      </Card>
    </div>
  );
}

export default function EventsPage() {
  return (
    <>
      <PageHeader title="Hall bookings" description="Conference hall enquiries, confirmed events and payments." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
