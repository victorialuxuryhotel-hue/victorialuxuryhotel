import { describe, expect, it } from "vitest";
import { reservationSteps, type Step } from "./reservation-steps";

const base = { roomNumber: "102", checkIn: "2026-11-24", checkOut: "2026-11-26", totalKobo: 8_000_000, source: "walk_in", createdAt: "2026-11-24T12:00:00Z" } as const;
const today = "2026-11-25";
/** The step StepList highlights: the first one marked "now". */
const current = (steps: Step[] | null) => steps?.find((s) => s.state === "now");

describe("booking progress steps", () => {
  it("an unpaid booking's next step is taking payment", () => {
    const s = reservationSteps({ ...base, status: "pending_payment", paidKobo: 0 }, today);
    expect(current(s)).toMatchObject({ title: "Take payment", detail: "₦80,000 owed before check-in" });
  });

  it("Paid is ticked only when nothing is owed", () => {
    const paid = reservationSteps({ ...base, status: "confirmed", paidKobo: 8_000_000 }, today)!;
    expect(paid[1]).toEqual({ title: "Paid", detail: "Paid in full", state: "done" });
    expect(current(paid)?.title).toBe("Check in");
  });

  it("a guest in the room who owes money must pay before check-out", () => {
    const s = reservationSteps({ ...base, status: "checked_in", totalKobo: 8_500_000, paidKobo: 8_000_000 }, today)!;
    expect(s[1]).toEqual({ title: "Take payment", detail: "₦5,000 owed", state: "now" });
    expect(current(s)?.title).toBe("Take payment");
  });

  it("a paid guest in the room is ready to check out", () => {
    const s = reservationSteps({ ...base, status: "checked_in", paidKobo: 8_000_000 }, today);
    expect(current(s)?.title).toBe("Check out");
  });
});
