import type { Metadata } from "next";
import { Suspense } from "react";
import { TodayView } from "@/components/management/today";
import { LoadingState } from "@/components/ui/feedback";
import { greeting, needsYouNow, roomCounts } from "@/domain/today";
import { hotelTimeNow } from "@/lib/hotel-date";
import { requireStaff } from "@/server/auth";
import { movements } from "@/server/queries/reservations";
import { roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Today" };

async function Content() {
  const staff = await requireStaff();
  const [m, rooms] = await Promise.all([movements(), roomBoard()]);
  return (
    <TodayView
      firstName={staff.fullName.split(" ")[0] ?? staff.fullName}
      greeting={greeting(Number(hotelTimeNow().slice(0, 2)))}
      today={m.today}
      needs={needsYouNow(m.arrivals, rooms)}
      arrivals={m.arrivals}
      departures={m.departures}
      counts={roomCounts(rooms)}
      links={{
        reservation: (id) => `/app/reservations/${id}`,
        pay: (id) => `/app/payments/record?reservation=${id}`,
        rooms: (state) => (state ? `/app/rooms?state=${state}` : "/app/rooms"),
      }}
    />
  );
}

/** Front-desk home (managers land on the dashboard, and can open this too). */
export default function TodayPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Content />
    </Suspense>
  );
}
