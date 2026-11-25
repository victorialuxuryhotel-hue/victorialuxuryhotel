import { TodayView } from "@/components/management/today";
import { greeting, needsYouNow, roomCounts, tonightView } from "@/domain/today";
import { reservations, rooms, today } from "../../_sample";

const detail = "/preview/app/reservations/vl-7kq3pm";

export default function Page() {
  const arrivals = reservations.filter((r) => r.checkIn === today && (r.status === "confirmed" || r.status === "pending_payment"));
  const departures = reservations.filter((r) => r.checkOut <= today && r.status === "checked_in");
  const board = rooms.map((r) => (r.number === "204" ? { ...r, readiness: "needs_cleaning" as const } : r));
  return (
    <TodayView
      firstName="Bisi"
      greeting={greeting(9)}
      today={today}
      needs={needsYouNow(
        {
          today,
          arrivals,
          inHouse: reservations.filter((r) => r.status === "checked_in"),
          missed: reservations.filter((r) => r.status === "confirmed" && r.checkIn < today),
        },
        board,
      )}
      arrivals={arrivals}
      departures={departures}
      inHouse={reservations.filter((r) => r.status === "checked_in")}
      counts={roomCounts(board)}
      progress={{ arrived: 13, left: 35 }}
      tonight={tonightView([
        { categoryId: "standard", name: "Standard", rateKobo: 4_000_000, rooms: 28, free: 16, held: 2 },
        { categoryId: "deluxe", name: "Deluxe", rateKobo: 5_500_000, rooms: 12, free: 3, held: 0 },
        { categoryId: "suite", name: "Suite", rateKobo: 8_500_000, rooms: 4, free: 0, held: 0 },
        { categoryId: "apartment", name: "Apartment", rateKobo: 12_000_000, rooms: 2, free: 1, held: 0 },
      ])}
      links={{ reservation: () => detail, pay: () => "/preview/app/payments/record", rooms: (s) => (s ? `/preview/app/rooms?state=${s}` : "/preview/app/rooms"), newBooking: () => "/preview/app/reservations/new" }}
    />
  );
}
