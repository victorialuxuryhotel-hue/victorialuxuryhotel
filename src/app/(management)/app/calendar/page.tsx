import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles } from "@/components/ui/button";
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

type Search = Promise<{ from?: string | string[]; booking?: string | string[]; nights?: string | string[] }>;

async function Content({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const c = await roomCalendar(typeof sp.from === "string" ? sp.from : undefined);
  // 7 or 14 nights (design R103): the query always fetches CALENDAR_DAYS; the week view shows the first 7.
  const nights = sp.nights === "7" ? 7 : CALENDAR_DAYS;
  const { days, blocks } = calendarLayout({ from: c.from, days: nights, today: c.today, types: c.types, rooms: c.rooms, stays: c.stays, free: c.free });
  const url = (from: string, n: number) => {
    const q = new URLSearchParams();
    if (from !== c.firstBookable) q.set("from", from);
    if (n === 7) q.set("nights", "7");
    return q.size ? `/app/calendar?${q}` : "/app/calendar";
  };
  const here = (from: string) => url(from, nights);
  return (
    <>
    {typeof sp.booking === "string" ? <BookingPanel reference={sp.booking} closeHref={withoutBooking("/app/calendar", sp)} /> : null}
    <RoomCalendar
      days={days}
      blocks={blocks}
      today={c.today}
      firstBookable={c.firstBookable}
      links={{
        booking: (b) => withBooking("/app/calendar", { from: typeof sp.from === "string" ? sp.from : undefined, nights: nights === 7 ? "7" : undefined }, b.stay.reference),
        newBooking: (type, date, room) => `/app/reservations/new?type=${type}&checkIn=${date}${room ? `&room=${room}` : ""}`,
        shift: (n) => here(addDays(c.from, n)),
        today: url(c.firstBookable, nights),
        nights: (n) => url(c.from, n),
      }}
    />
    </>
  );
}

export default function CalendarPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Every room, night by night"
        actions={<Link href="/app/reservations/new" className={buttonStyles()}>New booking</Link>}
      />
      <div className="px-4 py-5 lg:px-7">
        <Suspense fallback={<LoadingState />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
