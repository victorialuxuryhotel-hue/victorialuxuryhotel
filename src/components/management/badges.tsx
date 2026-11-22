import { Badge } from "@/components/ui/badge";
import {
  paymentStatus,
  reservationStatus,
  roomBoardState,
  roomReadiness,
  type PaymentStatus,
  type ReservationStatus,
  type RoomBoardState,
  type RoomReadiness,
} from "@/domain/status";

export const ReservationBadge = ({ status }: { status: ReservationStatus }) => (
  <Badge tone={reservationStatus[status].tone}>{reservationStatus[status].label}</Badge>
);

export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge tone={paymentStatus[status].tone}>{paymentStatus[status].label}</Badge>
);

export const ReadinessBadge = ({ readiness }: { readiness: RoomReadiness }) => (
  <Badge tone={roomReadiness[readiness].tone}>{roomReadiness[readiness].label}</Badge>
);

export const RoomStateBadge = ({ state }: { state: RoomBoardState }) => (
  <Badge tone={roomBoardState[state].tone}>{roomBoardState[state].label}</Badge>
);

/** Paid vs total, with balance. Used wherever money owed must be obvious. */
export function PaidProgress({ paidKobo, totalKobo, format }: { paidKobo: number; totalKobo: number; format: (k: number) => string }) {
  const pct = Math.min(100, Math.round((paidKobo / totalKobo) * 100));
  const balance = totalKobo - paidKobo;
  return (
    <div className="w-full min-w-0 md:min-w-32">
      <div className="h-1.5 overflow-hidden rounded-full bg-ivory-200">
        <div className={pct === 100 ? "h-full bg-success-600" : "h-full bg-gold-500"} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-500">{balance > 0 ? `${format(balance)} due` : "Paid in full"}</p>
    </div>
  );
}
