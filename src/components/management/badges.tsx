import { Badge, type Tone } from "@/components/ui/badge";
import { owedOf } from "@/domain/next-step";
import { formatNaira } from "@/lib/format";
import {
  bookingSource,
  paymentStatus,
  reservationStatus,
  roomReadiness,
  type BookingSource,
  type PaymentStatus,
  type ReservationStatus,
  type RoomReadiness,
} from "@/domain/status";

export const ReservationBadge = ({ status }: { status: ReservationStatus }) => (
  <Badge tone={reservationStatus[status].tone}>{reservationStatus[status].label}</Badge>
);

/** Where the booking came from (interface brief I4): information, not a state. The website is pale navy (design R101). */
export const SourceBadge = ({ source }: { source: BookingSource }) => (
  <Badge tone={source === "website" ? "info" : "neutral"} data-source={source}>{bookingSource[source]}</Badge>
);

/**
 * A booking's state in the words the front desk uses (designs R101, R102): Awaiting payment, Owes ₦X, Paid,
 * Checked in, Overdue (still in after check-out day), Checked out, Cancelled. Display only: it reads the same
 * status and balance the rest of the app uses.
 */
export function BookingStatusBadge({ r, today }: { r: { status: ReservationStatus; checkOut: string; totalKobo: number; paidKobo: number; pendingKobo?: number }; today: string }) {
  const owed = owedOf(r);
  const [label, tone]: [string, Tone] =
    r.status === "pending_payment" ? ["Awaiting payment", "warning"]
    : r.status === "confirmed" ? (owed > 0 ? [`Owes ${formatNaira(owed)}`, "warning"] : ["Paid", "success"])
    : r.status === "checked_in" ? (r.checkOut < today ? ["Overdue", "danger"] : owed > 0 ? [`Owes ${formatNaira(owed)}`, "warning"] : ["Checked in", "info"])
    : r.status === "cancelled" ? ["Cancelled", "neutral"]
    : [reservationStatus[r.status].label, reservationStatus[r.status].tone];
  return <Badge tone={tone} data-status={r.status}>{label}</Badge>;
}

export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge tone={paymentStatus[status].tone}>{paymentStatus[status].label}</Badge>
);

export const ReadinessBadge = ({ readiness }: { readiness: RoomReadiness }) => (
  <Badge tone={roomReadiness[readiness].tone}>{roomReadiness[readiness].label}</Badge>
);

export function PaidProgress({ paidKobo, totalKobo, format }: { paidKobo: number; totalKobo: number; format: (k: number) => string }) {
  const pct = Math.min(100, Math.round((paidKobo / totalKobo) * 100));
  const balance = totalKobo - paidKobo;
  return (
    <div className="w-full min-w-0 md:min-w-32">
      <div className="h-1.5 overflow-hidden rounded-full bg-ivory-200">
        <div className={pct === 100 ? "h-full bg-success-600" : "h-full bg-gold-500"} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-500">{balance > 0 ? `${format(balance)} owed` : "Paid in full"}</p>
    </div>
  );
}
