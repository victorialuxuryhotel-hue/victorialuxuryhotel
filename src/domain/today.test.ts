import { describe, expect, it } from "vitest";
import type { ReservationRow } from "./views";
import { greeting, needsYouNow, roomCounts } from "./today";

const base: ReservationRow = {
  id: "a", reference: "VL-A", guestName: "Ada", category: "Deluxe", checkIn: "2026-12-01", checkOut: "2026-12-02",
  guests: 1, totalKobo: 100, paidKobo: 100, status: "confirmed", source: "website",
};
const rooms = [
  { id: "1", number: "101", readiness: "ready" as const },
  { id: "2", number: "102", readiness: "needs_cleaning" as const },
];

describe("needsYouNow", () => {
  it("is empty when every arrival is paid, has a room and the room is ready", () => {
    expect(needsYouNow([{ ...base, roomNumber: "101" }], rooms)).toEqual([]);
  });

  it("flags unpaid arrivals, missing rooms and rooms not ready, money first", () => {
    const list = needsYouNow(
      [
        { ...base, id: "dirty", roomNumber: "102" },
        { ...base, id: "noroom" },
        { ...base, id: "unpaid", roomNumber: "101", paidKobo: 40 },
      ],
      rooms,
    );
    expect(list.map((n) => [n.kind, n.reservation.id])).toEqual([
      ["unpaid", "unpaid"],
      ["no_room", "noroom"],
      ["room_not_ready", "dirty"],
    ]);
    expect(list[0]).toMatchObject({ dueKobo: 60 });
  });

  it("an unpaid hold with no room shows both problems", () => {
    const list = needsYouNow([{ ...base, status: "pending_payment", paidKobo: 0 }], rooms);
    expect(list.map((n) => n.kind)).toEqual(["unpaid", "no_room"]);
  });

  it("ignores guests already checked in, cancelled or no-show", () => {
    const done = (["checked_in", "cancelled", "no_show", "expired"] as const).map((status) => ({ ...base, status, paidKobo: 0 }));
    expect(needsYouNow(done, rooms)).toEqual([]);
  });
});

describe("roomCounts", () => {
  it("counts ready, occupied and dirty rooms; arriving and maintenance are neither", () => {
    const states = ["available", "available", "occupied", "dirty", "arriving", "maintenance"] as const;
    expect(roomCounts(states.map((state) => ({ state })))).toEqual({ ready: 2, guestsIn: 1, toClean: 1 });
  });
});

describe("greeting", () => {
  it("switches at noon and 5pm", () => {
    expect([greeting(0), greeting(11), greeting(12), greeting(16), greeting(17), greeting(23)]).toEqual([
      "Good morning", "Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening",
    ]);
  });
});
