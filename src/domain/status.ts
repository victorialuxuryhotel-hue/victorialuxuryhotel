import type { Tone } from "@/components/ui/badge";

/**
 * Domain enums (mirroring the Postgres enums) with their staff-facing labels
 * and badge tones. One place, so every screen describes a status the same way.
 */
export const reservationStatus = {
  pending_payment: { label: "Awaiting payment", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "brand" },
  checked_in: { label: "Checked in", tone: "success" },
  checked_out: { label: "Checked out", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type ReservationStatus = keyof typeof reservationStatus;

export const paymentStatus = {
  pending: { label: "Pending", tone: "warning" },
  successful: { label: "Successful", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  abandoned: { label: "Abandoned", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type PaymentStatus = keyof typeof paymentStatus;

export const roomReadiness = {
  ready: { label: "Ready", tone: "success" },
  needs_cleaning: { label: "Needs cleaning", tone: "warning" },
  cleaning_in_progress: { label: "Cleaning", tone: "info" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type RoomReadiness = keyof typeof roomReadiness;

export const bookingSource = {
  website: "Website",
  walk_in: "Walk-in",
  phone: "Phone",
  whatsapp: "WhatsApp",
  staff: "Staff",
} as const;
export type BookingSource = keyof typeof bookingSource;

export const paymentMethod = {
  card: "Card",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos_terminal: "POS terminal",
  ussd: "USSD",
  other: "Other",
} as const;
export type PaymentMethod = keyof typeof paymentMethod;

export const staffRole = {
  owner: "Owner",
  general_manager: "General manager",
  front_desk: "Front desk",
} as const;
export type StaffRole = keyof typeof staffRole;

/**
 * What the front desk sees for a room right now. Occupancy is derived from
 * reservations; only maintenance and readiness are stored on the room.
 */
export const roomBoardState = {
  occupied: { label: "Occupied", tone: "brand" },
  arriving: { label: "Arriving", tone: "info" },
  available: { label: "Available", tone: "success" },
  dirty: { label: "Needs cleaning", tone: "warning" },
  maintenance: { label: "Maintenance", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type RoomBoardState = keyof typeof roomBoardState;
