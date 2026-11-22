import { TodayView } from "@/components/management/today";
import { greeting, needsYouNow, roomCounts } from "@/domain/today";
import { reservations, rooms, today } from "../../_sample";

const detail = "/preview/app/reservations/vl-7kq3pm";

export default function Page() {
  const arrivals = reservations.filter((r) => r.checkIn === today && (r.status === "confirmed" || r.status === "pending_payment"));
  const departures = reservations.filter((r) => r.checkOut <= today && r.status === "checked_in");
  // Sample: Adaeze's room 204 still needs cleaning.
  const board = rooms.map((r) => (r.number === "204" ? { ...r, readiness: "needs_cleaning" as const } : r));
  return (
    <TodayView
      firstName="Bisi"
      greeting={greeting(9)}
      today={today}
      needs={needsYouNow(arrivals, board)}
      arrivals={arrivals}
      departures={departures}
      counts={roomCounts(board)}
      links={{ reservation: () => detail, pay: () => "/preview/app/payments/record", rooms: (s) => (s ? `/preview/app/rooms?state=${s}` : "/preview/app/rooms") }}
    />
  );
}
