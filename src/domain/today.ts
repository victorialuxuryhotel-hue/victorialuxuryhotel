import { owedOf } from "./next-step";
import type { ReservationRow, RoomTile } from "./views";

/**
 * One job per guest on Today's "Needs you now", in the order the front desk should do them.
 * Status comes from what was recorded (checked in, paid), never from dates alone: a date that
 * passed with nothing recorded is a job, not something to hide.
 */
export type NeedsYou =
  | { kind: "owes"; reservation: ReservationRow; owedKobo: number }
  | { kind: "overdue_checkout"; reservation: ReservationRow }
  | { kind: "not_arrived"; reservation: ReservationRow }
  | { kind: "unpaid"; reservation: ReservationRow; owedKobo: number }
  | { kind: "no_room"; reservation: ReservationRow }
  | { kind: "room_occupied"; reservation: ReservationRow; occupant: ReservationRow }
  | { kind: "room_not_ready"; reservation: ReservationRow; room: Pick<RoomTile, "id" | "number" | "readiness"> };

export type TodayInput = {
  today: string;
  /** Everyone checked in, whatever their dates. */
  inHouse: ReservationRow[];
  /** Bookings arriving today that aren't checked in yet. */
  arrivals: ReservationRow[];
  /** Paid bookings whose check-in date has passed with no check-in recorded. */
  missed: ReservationRow[];
};

const ORDER: Record<NeedsYou["kind"], number> = { owes: 0, overdue_checkout: 1, not_arrived: 2, unpaid: 3, room_occupied: 4, no_room: 5, room_not_ready: 6 };

export function needsYouNow(input: TodayInput, rooms: Pick<RoomTile, "id" | "number" | "readiness">[]): NeedsYou[] {
  const byNumber = new Map(rooms.map((r) => [r.number, r]));
  const occupantOf = new Map(input.inHouse.filter((x) => x.status === "checked_in" && x.roomNumber).map((x) => [x.roomNumber!, x]));
  const out: NeedsYou[] = [];
  const seen = new Set<string>();
  const add = (n: NeedsYou) => {
    if (seen.has(n.reservation.id)) return;
    seen.add(n.reservation.id);
    out.push(n);
  };

  for (const r of input.inHouse.filter((x) => x.status === "checked_in")) {
    const owed = owedOf(r);
    if (owed > 0) add({ kind: "owes", reservation: r, owedKobo: owed });
    else if (r.checkOut < input.today) add({ kind: "overdue_checkout", reservation: r });
  }
  for (const r of input.missed.filter((x) => x.status === "confirmed" && x.checkIn < input.today)) add({ kind: "not_arrived", reservation: r });
  for (const r of input.arrivals.filter((x) => x.status === "pending_payment" || x.status === "confirmed")) {
    const owed = owedOf(r);
    // Payment comes first; the room is assigned automatically once it is paid.
    if (r.status === "pending_payment" || owed > 0) add({ kind: "unpaid", reservation: r, owedKobo: owed });
    else if (!r.roomNumber) add({ kind: "no_room", reservation: r });
    else if (occupantOf.has(r.roomNumber)) add({ kind: "room_occupied", reservation: r, occupant: occupantOf.get(r.roomNumber)! });
    else {
      const room = byNumber.get(r.roomNumber);
      if (room && room.readiness !== "ready") add({ kind: "room_not_ready", reservation: r, room });
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

export type RoomCounts = { ready: number; occupied: number; toClean: number; outOfOrder: number };

/** Every active room falls in exactly one group, so the four add up to the number of rooms. Occupied = guests checked in. */
export function roomCounts(rooms: Pick<RoomTile, "state" | "readiness">[]): RoomCounts {
  const counts: RoomCounts = { ready: 0, occupied: 0, toClean: 0, outOfOrder: 0 };
  for (const r of rooms) {
    if (r.state === "occupied") counts.occupied++;
    else if (r.state === "maintenance") counts.outOfOrder++;
    else if (r.readiness === "ready") counts.ready++;
    else counts.toClean++;
  }
  return counts;
}

export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
