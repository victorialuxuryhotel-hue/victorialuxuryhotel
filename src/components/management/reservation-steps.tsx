import { Check } from "lucide-react";
import type { ReservationDetail } from "@/domain/views";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

type R = Pick<ReservationDetail, "status" | "roomNumber" | "checkIn" | "checkOut" | "totalKobo" | "paidKobo" | "source" | "createdAt">;

export type Step = { title: string; detail: string; state: "done" | "now" | "later" };

/**
 * Where the booking is and what comes next, as a numbered list, so new staff
 * don't have to interpret statuses. Derived entirely from the reservation.
 */
export function reservationSteps(r: R, today: string): Step[] | null {
  if (!["pending_payment", "confirmed", "checked_in", "checked_out"].includes(r.status)) return null;
  const balance = r.totalKobo - r.paidKobo;
  const paid = r.status !== "pending_payment";
  const inHouse = r.status === "checked_in" || r.status === "checked_out";
  return [
    { title: "Booked", detail: `${r.source === "website" ? "Website" : "At the desk"} · ${formatDate(r.createdAt.slice(0, 10), { weekday: false, year: false })}`, state: "done" },
    paid
      ? { title: "Paid", detail: balance > 0 ? `${formatNaira(balance)} still owed` : "Paid in full", state: "done" }
      : { title: "Take payment", detail: `${formatNaira(balance)} due before check-in`, state: "now" },
    r.roomNumber
      ? { title: "Room assigned", detail: `Room ${r.roomNumber}`, state: "done" }
      : { title: "Assign a room", detail: paid ? "Choose a ready room" : "After payment", state: paid ? "now" : "later" },
    inHouse
      ? { title: "Checked in", detail: "Key handed over", state: "done" }
      : {
          title: "Check in",
          detail: r.checkIn > today ? `Arrives ${formatDate(r.checkIn, { year: false })}` : "Hand over the key",
          state: paid && r.roomNumber ? "now" : "later",
        },
    r.status === "checked_out"
      ? { title: "Checked out", detail: "Stay complete", state: "done" }
      : { title: "Check out", detail: `Due ${formatDate(r.checkOut, { year: false })}`, state: r.status === "checked_in" ? "now" : "later" },
  ];
}

export function StepList({ steps }: { steps: Step[] }) {
  // Only the first "now" step is the next step; later "now"s wait for it.
  const next = steps.findIndex((s) => s.state === "now");
  return (
    <ol className="divide-y divide-ivory-200 rounded-card border border-ivory-200 bg-white" aria-label="Progress of this booking">
      {steps.map((s, i) => {
        const state = s.state === "now" && i !== next ? "later" : s.state;
        return (
          <li key={s.title} aria-current={state === "now" ? "step" : undefined} className="grid grid-cols-[1.75rem_1fr] gap-3 px-4 py-3">
            <span
              className={cn(
                "flex size-6.5 items-center justify-center rounded-full border text-xs tabular-nums",
                state === "done" && "border-gold-500 bg-gold-50 text-gold-700",
                state === "now" && "border-navy-800 bg-navy-800 text-white",
                state === "later" && "border-ink-300 text-ink-400",
              )}
            >
              {state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span>
              <span className={cn("block text-sm", state === "now" ? "font-semibold text-ink-900" : state === "done" ? "text-ink-600" : "text-ink-500")}>{s.title}</span>
              <span className="block text-xs text-ink-500">{s.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

