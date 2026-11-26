import type {
  BookingSource,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  RoomBoardState,
  RoomReadiness,
  StaffRole,
} from "./status";

export type ReservationRow = {
  id: string;
  reference: string;
  guestName: string;
  guestPhone?: string;
  category: string;
  roomNumber?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalKobo: number;
  paidKobo: number;
  status: ReservationStatus;
  source: BookingSource;
  holdExpiresAt?: string;
  attention?: string;
  /** A change (upgrade, move, extra nights) waiting for its payment: owed now, applied when paid. */
  pendingKobo?: number;
};

export type PendingChange = { id: string; kind: "room" | "dates"; description: string; amountKobo: number };

export type PaymentRow = {
  id: string;
  reservationId?: string;
  reservationReference: string;
  guestName: string;
  amountKobo: number;
  method: PaymentMethod;
  provider: "paystack" | "offline";
  providerReference?: string;
  status: PaymentStatus;
  paidAt?: string;
  receiptNumber?: string;
  recordedBy?: string;
  kind?: "payment" | "refund";
  correctsPaymentId?: string;
  correctedKobo?: number;
  notes?: string;
};

export type HistoryEntry = { at: string; label: string; by?: string; note?: string };

export type ReservationDetail = ReservationRow & {
  guestEmail?: string;
  nightlyRateKobo: number;
  nights: number;
  specialRequests?: string;
  createdAt: string;
  createdBy?: string;
  payments: PaymentRow[];
  history: HistoryEntry[];
  pendingChange?: PendingChange;
};

export type RoomTile = {
  id: string;
  number: string;
  category: string;
  floor?: string;
  state: RoomBoardState;
  readiness: RoomReadiness;
  guestName?: string;
  until?: string;
  note?: string;
  /** Occupied rooms: the guest is due out today, or should have left already. */
  due?: "today" | "overdue";
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  nightlyRateKobo: number;
  maxOccupancy: number;
  rooms: number;
  images: number;
  isActive: boolean;
};

export type GuestRow = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  stays: number;
  lastStay?: string;
  totalPaidKobo: number;
};

export type StaffRow = { id: string; name: string; email: string; phone?: string; role: StaffRole; isActive: boolean; lastSignIn?: string; lastSeen?: string; invited?: boolean };

export type ActivityRow = { id: string; at: string; actor: string; action: string; summary: string };

export type AvailabilityOption = {
  slug: string;
  name: string;
  summary: string;
  maxOccupancy: number;
  isAvailable: boolean;
  nightlyRateKobo: number;
  totalKobo: number;
  nights: number;
  freeFrom?: string;
  photo?: { image: string; alt: string };
};
