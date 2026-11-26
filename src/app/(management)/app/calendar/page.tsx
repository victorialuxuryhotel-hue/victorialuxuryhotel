import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { RoomCalendar } from "@/components/management/room-calendar";
import { BookingPanel } from "@/components/management/booking-panel";
import { withBooking, withoutBooking } from "@/lib/panel";
import { LoadingState } from "@/components/ui/feedback";
import { calendarLayout } from "@/domain/calendar";
import { can } from "@/lib/auth/permissions";
import { addDays } from "@/lib/hotel-date";
import { requireStaff } from "@/server/auth";
import { CALENDAR_DAYS, roomCalendar } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Calendar" };

type Search = Promise<{ from?: string | string[]; booking?: string | string[] }>;

async function Content({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const c = await roomCalendar(typeof sp.from === "string" ? sp.from : undefined);
  const { days, blocks } = calendarLayout({ from: c.from, days: CALENDAR_DAYS, today: c.today, types: c.types, rooms: c.rooms, stays: c.stays, free: c.free });
  const here = (from: string) => (from === c.firstBookable ? "/app/calendar" : `/app/calendar?from=${from}`);
  return (
    <>
    {typeof sp.booking === "string" ? <BookingPanel reference={sp.booking} closeHref={withoutBooking("/app/calendar", sp)} /> : null}
    <RoomCalendar
      days={days}
      blocks={blocks}
      today={c.today}
      firstBookable={c.firstBookable}
      links={{
        booking: (b) => withBooking("/app/calendar", { from: typeof sp.from === "string" ? sp.from : undefined }, b.stay.reference),
        newBooking: (type, date, room) => `/app/reservations/new?type=${type}&checkIn=${date}${room ? `&room=${room}` : ""}`,
        shift: (n) => here(addDays(c.from, n)),
        today: "/app/calendar",
      }}
    />
    </>
  );
}

export default function CalendarPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Calendar" description="Every room for the next two weeks. Click a booking to see it, or an empty night to start a booking." />
      <div className="px-4 py-6 lg:px-8">
        <Suspense fallback={<LoadingState />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
