import { describe, expect, it } from "vitest";
import { nextStep, type NextStepInput } from "./next-step";

const today = "2026-11-25";
const b = (over: Partial<NextStepInput>): NextStepInput => ({
  status: "confirmed", totalKobo: 8_000_000, paidKobo: 8_000_000, roomNumber: "102", checkIn: today, checkOut: "2026-11-27", ...over,
});

describe("next step for a booking (matches what the server allows)", () => {
  it("money owed always comes first: before check-in, before check-out, and after a late charge", () => {
    expect(nextStep(b({ status: "pending_payment", paidKobo: 0 }), today)).toEqual({ kind: "take_payment", owedKobo: 8_000_000 });
    expect(nextStep(b({ paidKobo: 7_500_000 }), today)).toEqual({ kind: "take_payment", owedKobo: 500_000 });
    expect(nextStep(b({ status: "checked_in", totalKobo: 8_500_000 }), today)).toEqual({ kind: "take_payment", owedKobo: 500_000 });
  });

  it("a paid booking needs a room, then its arrival day, then check-in", () => {
    expect(nextStep(b({ roomNumber: null }), today)).toEqual({ kind: "assign_room" });
    expect(nextStep(b({ checkIn: "2026-12-01", checkOut: "2026-12-03" }), today)).toEqual({ kind: "wait_for_arrival", checkIn: "2026-12-01" });
    expect(nextStep(b({ checkIn: "2026-11-20", checkOut: today }), today)).toEqual({ kind: "stay_ended" });
    expect(nextStep(b({}), today)).toEqual({ kind: "check_in" });
  });

  it("a paid guest in house checks out; closed bookings have nothing next", () => {
    expect(nextStep(b({ status: "checked_in" }), today)).toEqual({ kind: "check_out" });
    for (const status of ["checked_out", "cancelled", "expired", "no_show"] as const) expect(nextStep(b({ status }), today)).toEqual({ kind: "none" });
  });

  it("an overpayment is never shown as money owed", () => {
    expect(nextStep(b({ status: "checked_in", paidKobo: 9_000_000 }), today)).toEqual({ kind: "check_out" });
  });
});
