import { canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInStrip } from "@/components/management/idle-lock";
import { TodayView } from "@/components/management/today";
import { staffRole } from "@/domain/status";
import { LoadingState } from "@/components/ui/feedback";
import { greeting, needsYouNow, roomCounts, tonightView } from "@/domain/today";
import { hotelTimeNow } from "@/lib/hotel-date";
import { requireStaff } from "@/server/auth";
import { movements } from "@/server/queries/reservations";
import { availableTonight, roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Today" };

async function Content() {
  const staff = await requireStaff();
  if (!canAny(staff.role, "reservations.manage")) return <AccessDenied />;
  const [m, rooms, tonight] = await Promise.all([movements(), roomBoard(), availableTonight()]);
  return (
    <TodayView
      firstName={staff.fullName.split(" ")[0] ?? staff.fullName}
      greeting={greeting(Number(hotelTimeNow().slice(0, 2)))}
      today={m.today}
      needs={needsYouNow(m, rooms)}
      arrivals={m.arrivals}
      departures={m.departures}
      inHouse={m.inHouse}
      counts={roomCounts(rooms)}
      tonight={tonightView(tonight)}
      progress={m.progress}
      signedIn={<SignedInStrip name={staff.fullName} roleLabel={staffRole[staff.role]} />}
      links={{
        reservation: (id) => `/app/reservations/${id}`,
        pay: (id) => `/app/payments/record?reservation=${id}`,
        rooms: (state) => (state ? `/app/rooms?state=${state}` : "/app/rooms"),
        newBooking: (categoryId) => `/app/reservations/new?type=${encodeURIComponent(categoryId)}`,
      }}
    />
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Content />
    </Suspense>
  );
}
