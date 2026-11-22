import type {
  BookingSource,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  RoomBoardState,
  RoomReadiness,
  StaffRole,
} from "./status";

/** Read models that screens render. Data-access code maps database rows into these. */

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
};

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
  /** "refund" rows on a reservation are corrections made by a manager. */
  kind?: "payment" | "refund";
  correctsPaymentId?: string;
  /** For a payment: how much of it has been corrected so far. */
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

export type StaffRow = { id: string; name: string; email: string; phone?: string; role: StaffRole; isActive: boolean; lastSignIn?: string };

export type ActivityRow = { id: string; at: string; actor: string; action: string; summary: string };

/**
 * One room category's result in a public availability search. Deliberately
 * carries no room counts: inventory is internal and never shown to guests.
 */
export type AvailabilityOption = {
  slug: string;
  name: string;
  summary: string;
  maxOccupancy: number;
  isAvailable: boolean;
  nightlyRateKobo: number;
  totalKobo: number;
  nights: number;
  /** For a type that fits the party but is full: the nearest check-in (±14 days) with the same nights free. */
  freeFrom?: string;
};
