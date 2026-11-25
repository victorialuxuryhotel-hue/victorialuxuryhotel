import { describe, expect, it } from "vitest";
import type { ReservationRow } from "./views";
import { greeting, needsYouNow, roomCounts, type TodayInput } from "./today";

const today = "2026-11-25";
const base: ReservationRow = {
  id: "a", reference: "VL-A", guestName: "Ada", category: "Deluxe", checkIn: today, checkOut: "2026-11-27",
  guests: 1, totalKobo: 100, paidKobo: 100, status: "confirmed", source: "website",
};
const rooms = [
  { id: "1", number: "101", readiness: "ready" as const },
  { id: "2", number: "102", readiness: "needs_cleaning" as const },
];
const day = (input: Partial<TodayInput>) => needsYouNow({ today, inHouse: [], arrivals: [], missed: [], ...input }, rooms);
const kinds = (list: ReturnType<typeof needsYouNow>) => list.map((n) => [n.kind, n.reservation.id]);

describe("needsYouNow", () => {
  it("is empty when nobody owes, nobody is overdue and every arrival is paid with a clean room", () => {
    expect(day({ arrivals: [{ ...base, roomNumber: "101" }], inHouse: [{ ...base, id: "in", status: "checked_in", checkIn: "2026-11-24" }] })).toEqual([]);
  });

  it("a guest in house who owes money: Take payment, with the amount", () => {
    const list = day({ inHouse: [{ ...base, id: "ibrahim", status: "checked_in", totalKobo: 108_000_000, paidKobo: 0 }] });
    expect(list).toEqual([expect.objectContaining({ kind: "owes", owedKobo: 108_000_000 })]);
  });

  it("a guest still checked in after their check-out date is overdue", () => {
    const list = day({ inHouse: [{ ...base, id: "grace", status: "checked_in", checkIn: "2026-11-20", checkOut: "2026-11-22" }] });
    expect(kinds(list)).toEqual([["overdue_checkout", "grace"]]);
  });

  it("leaving today is not overdue", () => {
    expect(day({ inHouse: [{ ...base, status: "checked_in", checkIn: "2026-11-23", checkOut: today }] })).toEqual([]);
  });

  it("a paid guest who was due before today and never arrived: didn't arrive", () => {
    const list = day({ missed: [{ ...base, id: "chioma", checkIn: "2026-11-24", checkOut: "2026-11-26", roomNumber: "104" }] });
    expect(kinds(list)).toEqual([["not_arrived", "chioma"]]);
  });

  it("an arrival who hasn't paid has one job only: Take payment (not also 'no room')", () => {
    const list = day({ arrivals: [{ ...base, id: "hold", status: "pending_payment", paidKobo: 0 }] });
    expect(list).toEqual([expect.objectContaining({ kind: "unpaid", owedKobo: 100 })]);
  });

  it("a paid arrival with no room, or a room not clean, gets that one job", () => {
    const list = day({ arrivals: [{ ...base, id: "dirty", roomNumber: "102" }, { ...base, id: "noroom" }] });
    expect(kinds(list)).toEqual([["no_room", "noroom"], ["room_not_ready", "dirty"]]);
  });

  it("a paid arrival whose room still has a guest checked in must be moved", () => {
    const list = day({
      arrivals: [{ ...base, id: "qa", roomNumber: "107" }],
      inHouse: [{ ...base, id: "grace", guestName: "Grace", status: "checked_in", checkIn: "2026-11-19", checkOut: "2026-11-22", roomNumber: "107" }],
    });
    expect(kinds(list)).toEqual([["overdue_checkout", "grace"], ["room_occupied", "qa"]]);
    expect(list[1]).toMatchObject({ occupant: { id: "grace" } });
  });

  it("orders money owed, overdue, didn't arrive, then today's arrivals", () => {
    const list = day({
      arrivals: [{ ...base, id: "unpaid", status: "pending_payment", paidKobo: 0 }],
      missed: [{ ...base, id: "missed", checkIn: "2026-11-24" }],
      inHouse: [
        { ...base, id: "overdue", status: "checked_in", checkIn: "2026-11-20", checkOut: "2026-11-22" },
        { ...base, id: "owes", status: "checked_in", paidKobo: 10 },
      ],
    });
    expect(list.map((n) => n.kind)).toEqual(["owes", "overdue_checkout", "not_arrived", "unpaid"]);
  });

  it("never lists one guest twice: an overdue guest who owes shows only Take payment", () => {
    const r = { ...base, id: "both", status: "checked_in" as const, checkIn: "2026-11-20", checkOut: "2026-11-22", paidKobo: 0 };
    expect(kinds(day({ inHouse: [r] }))).toEqual([["owes", "both"]]);
  });

  it("ignores bookings already finished", () => {
    const done = (["checked_out", "cancelled", "no_show", "expired"] as const).map((status, i) => ({ ...base, id: `d${i}`, status, paidKobo: 0 }));
    expect(day({ arrivals: done, inHouse: done, missed: done })).toEqual([]);
  });
});

describe("roomCounts", () => {
  it("puts every room in exactly one group, so the groups add up to all rooms", () => {
    const tiles = [
      { state: "available", readiness: "ready" },
      { state: "arriving", readiness: "ready" },
      { state: "arriving", readiness: "needs_cleaning" },
      { state: "occupied", readiness: "ready" },
      { state: "dirty", readiness: "needs_cleaning" },
      { state: "maintenance", readiness: "ready" },
    ] as const;
    const counts = roomCounts([...tiles]);
    expect(counts).toEqual({ ready: 2, occupied: 1, toClean: 2, outOfOrder: 1 });
    expect(counts.ready + counts.occupied + counts.toClean + counts.outOfOrder).toBe(tiles.length);
  });
});

describe("greeting", () => {
  it("switches at noon and 5pm", () => {
    expect([greeting(0), greeting(11), greeting(12), greeting(16), greeting(17), greeting(23)]).toEqual([
      "Good morning", "Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening",
    ]);
  });
});
