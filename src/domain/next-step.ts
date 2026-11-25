// What happens next for a booking: one rule, shown the same way on every screen.
// It mirrors the server's own checks (check-in and check-out are refused while money is owed),
// so a screen can never offer a step the server will refuse.

import type { ReservationStatus } from "./status";

export type NextStep =
  | { kind: "take_payment"; owedKobo: number }
  | { kind: "assign_room" }
  | { kind: "wait_for_arrival"; checkIn: string }
  | { kind: "stay_ended" }
  | { kind: "check_in" }
  | { kind: "check_out" }
  | { kind: "none" };

export type NextStepInput = {
  status: ReservationStatus;
  totalKobo: number;
  paidKobo: number;
  roomNumber?: string | null;
  checkIn: string;
  checkOut: string;
  /** A change waiting for its payment counts as owed: Take payment comes first. */
  pendingKobo?: number;
};

export const owedOf = (r: Pick<NextStepInput, "totalKobo" | "paidKobo" | "pendingKobo">) => Math.max(0, r.totalKobo - r.paidKobo) + (r.pendingKobo ?? 0);

export function nextStep(r: NextStepInput, today: string): NextStep {
  const owedKobo = owedOf(r);
  switch (r.status) {
    case "pending_payment":
      return { kind: "take_payment", owedKobo };
    case "confirmed":
      if (owedKobo > 0) return { kind: "take_payment", owedKobo };
      if (!r.roomNumber) return { kind: "assign_room" };
      if (r.checkIn > today) return { kind: "wait_for_arrival", checkIn: r.checkIn };
      if (r.checkOut <= today) return { kind: "stay_ended" };
      return { kind: "check_in" };
    case "checked_in":
      return owedKobo > 0 ? { kind: "take_payment", owedKobo } : { kind: "check_out" };
    case "checked_out":
      return owedKobo > 0 ? { kind: "take_payment", owedKobo } : { kind: "none" };
    default:
      return { kind: "none" };
  }
}
