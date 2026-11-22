import type { ReservationRow, RoomTile } from "./views";

/**
 * What the front desk has to deal with today, worked out from today's
 * arrivals and the room board. Pure, so it can be tested without a database.
 */
export type NeedsYou =
  | { kind: "unpaid"; reservation: ReservationRow; dueKobo: number }
  | { kind: "no_room"; reservation: ReservationRow }
  | { kind: "room_not_ready"; reservation: ReservationRow; room: Pick<RoomTile, "id" | "number" | "readiness"> };

export type RoomCounts = { ready: number; guestsIn: number; toClean: number };

export function needsYouNow(arrivals: ReservationRow[], rooms: Pick<RoomTile, "id" | "number" | "readiness">[]): NeedsYou[] {
  const byNumber = new Map(rooms.map((r) => [r.number, r]));
  const out: NeedsYou[] = [];
  // Only guests still to arrive: once checked in, an arrival is no longer the desk's problem today.
  for (const r of arrivals.filter((a) => a.status === "pending_payment" || a.status === "confirmed")) {
    const due = r.totalKobo - r.paidKobo;
    if (r.status === "pending_payment" || due > 0) out.push({ kind: "unpaid", reservation: r, dueKobo: Math.max(0, due) });
    if (!r.roomNumber) {
      out.push({ kind: "no_room", reservation: r });
      continue;
    }
    const room = byNumber.get(r.roomNumber);
    if (room && room.readiness !== "ready") out.push({ kind: "room_not_ready", reservation: r, room });
  }
  // Money first (it blocks check-in), then rooms to assign, then rooms to clean.
  const order = { unpaid: 0, no_room: 1, room_not_ready: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function roomCounts(rooms: Pick<RoomTile, "state">[]): RoomCounts {
  return {
    ready: rooms.filter((r) => r.state === "available").length,
    guestsIn: rooms.filter((r) => r.state === "occupied").length,
    toClean: rooms.filter((r) => r.state === "dirty").length,
  };
}

/** "Good morning" etc. for the hotel's local hour (0–23). */
export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
