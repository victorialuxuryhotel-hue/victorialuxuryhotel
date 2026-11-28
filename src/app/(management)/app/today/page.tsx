import { canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInStrip } from "@/components/management/idle-lock";
import { TodayView } from "@/components/management/today";
import { BookingPanel } from "@/components/management/booking-panel";
import { withBooking, withoutBooking } from "@/lib/panel";
import { staffRole } from "@/domain/status";
import { LoadingState } from "@/components/ui/feedback";
import { greeting, needsYouNow, roomCounts, tonightView } from "@/domain/today";
import { hotelTimeNow } from "@/lib/hotel-date";
import { requireStaff } from "@/server/auth";
import { movements } from "@/server/queries/reservations";
import { availableTonight, roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Today" };

type Search = Promise<{ booking?: string | string[] }>;

async function Content({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, "reservations.manage")) return <AccessDenied />;
  const [m, rooms, tonight, sp] = await Promise.all([movements(), roomBoard(), availableTonight(), searchParams]);
  return (
    <>
    {typeof sp.booking === "string" ? <BookingPanel reference={sp.booking} closeHref={withoutBooking("/app/today", sp)} /> : null}
    <TodayView
      firstName={staff.fullName.split(" ")[0] ?? staff.fullName}
      greeting={greeting(Number(hotelTimeNow().slice(0, 2)))}
      today={m.today}
      needs={needsYouNow(m, rooms)}
      arrivals={m.arrivals}
      departures={m.departures}
      inHouse={m.inHouse}
      counts={roomCounts(rooms)}
      toClean={rooms.filter((r) => r.state !== "occupied" && r.state !== "maintenance" && r.readiness !== "ready").map((r) => r.number)}
      tonight={tonightView(tonight)}
      progress={m.progress}
      signedIn={<SignedInStrip name={staff.fullName} roleLabel={staffRole[staff.role]} onStation={Boolean(staff.station)} />}
      links={{
        reservation: (id) => `/app/reservations/${id}`,
        panel: (r) => withBooking("/app/today", {}, r.reference),
        pay: (id) => `/app/payments/record?reservation=${id}`,
        rooms: (state) => (state ? `/app/rooms?state=${state}` : "/app/rooms"),
        newBooking: (categoryId) => `/app/reservations/new?type=${encodeURIComponent(categoryId)}`,
      }}
    />
    </>
  );
}

export default function TodayPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
