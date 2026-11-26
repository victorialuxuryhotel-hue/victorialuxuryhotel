import { describe, expect, it } from "vitest";
import { barKind, calendarLayout, packLanes, placeBar, type CalStay } from "./calendar";

const today = "2026-11-26";
const stay = (over: Partial<CalStay>): CalStay => ({
  id: "s", reference: "VL-AAAAAA", guestName: "Grace Adeyemi", roomId: "r1", categoryId: "std",
  checkIn: "2026-11-27", checkOut: "2026-11-30", end: "2026-11-30", status: "confirmed", ...over,
});

describe("room calendar bars", () => {
  it("colours by state: awaiting, confirmed, in house, due out today, overdue", () => {
    expect(barKind({ status: "pending_payment", checkOut: "2026-11-28" }, today)).toBe("awaiting");
    expect(barKind({ status: "confirmed", checkOut: "2026-11-28" }, today)).toBe("confirmed");
    expect(barKind({ status: "checked_in", checkOut: "2026-11-28" }, today)).toBe("in_house");
    expect(barKind({ status: "checked_in", checkOut: today }, today)).toBe("due_out");
    expect(barKind({ status: "checked_in", checkOut: "2026-11-24" }, today)).toBe("overdue");
  });

  it("places a stay by its nights: check-in column, one column per night, surname and nights", () => {
    expect(placeBar(stay({}), today, 14, today)).toMatchObject({ start: 1, span: 3, cutStart: false, cutEnd: false, label: "Adeyemi · 3n" });
  });

  it("clips to the window and says so", () => {
    const b = placeBar(stay({ checkIn: "2026-11-20", checkOut: "2026-12-20", end: "2026-12-20" }), today, 14, today)!;
    expect(b).toMatchObject({ start: 0, span: 14, cutStart: true, cutEnd: true });
    expect(placeBar(stay({ checkIn: "2026-11-20", checkOut: today, end: today }), today, 14, today)).toBeNull(); // left this morning
    expect(placeBar(stay({ checkIn: "2026-12-10", checkOut: "2026-12-12", end: "2026-12-12" }), today, 14, today)).toBeNull(); // after the window
  });

  it("an overstaying guest's bar runs to their effective end, not the booked check-out", () => {
    const b = placeBar(stay({ status: "checked_in", checkIn: "2026-11-20", checkOut: "2026-11-24", end: "2026-11-27" }), today, 14, today)!;
    expect(b).toMatchObject({ kind: "overdue", start: 0, span: 1, cutStart: true });
  });

  it("packs bookings without a room into as few rows as possible", () => {
    const bars = [
      placeBar(stay({ id: "a", roomId: null, checkIn: "2026-11-26", checkOut: "2026-11-28", end: "2026-11-28" }), today, 14, today)!,
      placeBar(stay({ id: "b", roomId: null, checkIn: "2026-11-27", checkOut: "2026-11-29", end: "2026-11-29" }), today, 14, today)!,
      placeBar(stay({ id: "c", roomId: null, checkIn: "2026-11-28", checkOut: "2026-11-30", end: "2026-11-30" }), today, 14, today)!,
    ];
    expect(packLanes(bars).map((l) => l.map((b) => b.stay.id))).toEqual([["a", "c"], ["b"]]);
  });

  it("groups rooms by type, adds rows for bookings without a room, and carries each night's free count", () => {
    const { days, blocks } = calendarLayout({
      from: today, days: 3, today,
      types: [{ id: "std", name: "Standard" }],
      rooms: [{ id: "r1", number: "101", categoryId: "std", outOfOrder: false, note: null }, { id: "r2", number: "102", categoryId: "std", outOfOrder: true, note: "Leak" }],
      stays: [stay({}), stay({ id: "x", roomId: null })],
      free: new Map([["std", new Map([[today, 1], ["2026-11-27", -1]])]]),
    });
    expect(days).toEqual(["2026-11-26", "2026-11-27", "2026-11-28"]);
    expect(blocks[0]!.free).toEqual([1, -1, 0]);
    expect(blocks[0]!.lanes.map((l) => [l.label, l.outOfOrder, l.bars.length])).toEqual([["101", false, 1], ["102", true, 0], ["No room yet", false, 1]]);
  });
});
