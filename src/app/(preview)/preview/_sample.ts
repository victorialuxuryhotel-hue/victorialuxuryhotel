import type {
  ActivityRow,
  AvailabilityOption,
  CategoryRow,
  GuestRow,
  PaymentRow,
  ReservationDetail,
  ReservationRow,
  RoomTile,
  StaffRow,
} from "@/domain/views";

export const today = "2026-12-01";

export const reservations: ReservationRow[] = [
  { id: "r1", reference: "VL-7KQ3PM", guestName: "Adaeze Okafor", guestPhone: "+234 803 000 0001", category: "Deluxe", roomNumber: "204", checkIn: "2026-12-01", checkOut: "2026-12-04", guests: 2, totalKobo: 16_500_000, paidKobo: 16_500_000, status: "confirmed", source: "website" },
  { id: "r2", reference: "VL-H2X9TA", guestName: "Tunde Bakare", guestPhone: "+234 806 000 0002", category: "Suite", checkIn: "2026-12-01", checkOut: "2026-12-02", guests: 2, totalKobo: 8_500_000, paidKobo: 0, status: "pending_payment", source: "phone", holdExpiresAt: "2026-12-01T18:00:00Z" },
  { id: "r3", reference: "VL-M4RD8C", guestName: "Grace Adeyemi", category: "Standard", roomNumber: "107", checkIn: "2026-11-28", checkOut: "2026-12-01", guests: 1, totalKobo: 12_000_000, paidKobo: 12_000_000, status: "checked_in", source: "walk_in" },
  { id: "r4", reference: "VL-P8WN2E", guestName: "Ibrahim Musa", category: "Apartment", roomNumber: "402", checkIn: "2026-11-20", checkOut: "2026-12-10", guests: 4, totalKobo: 240_000_000, paidKobo: 120_000_000, status: "checked_in", source: "whatsapp" },
  { id: "r5", reference: "VL-C6TB5Q", guestName: "Chioma Eze", category: "Standard", checkIn: "2026-12-03", checkOut: "2026-12-05", guests: 2, totalKobo: 8_000_000, paidKobo: 8_000_000, status: "confirmed", source: "website" },
  { id: "r6", reference: "VL-Z3KF7R", guestName: "Olumide Ajayi", category: "Deluxe", checkIn: "2026-11-25", checkOut: "2026-11-27", guests: 1, totalKobo: 11_000_000, paidKobo: 0, status: "cancelled", source: "phone" },
  { id: "r7", reference: "VL-Q9EV4H", guestName: "Ngozi Uche", category: "Suite", checkIn: "2026-12-01", checkOut: "2026-12-03", guests: 2, totalKobo: 17_000_000, paidKobo: 17_000_000, status: "confirmed", source: "website", attention: "Paid after hold expired. Confirm a suite is still free." },
];

export const reservationDetail: ReservationDetail = {
  ...reservations[0]!,
  guestEmail: "adaeze@example.com",
  nightlyRateKobo: 5_500_000,
  nights: 3,
  specialRequests: "Late arrival, around 9pm. Quiet room if possible.",
  createdAt: "2026-11-18T10:42:00Z",
  payments: [
    { id: "p1", reservationReference: "VL-7KQ3PM", guestName: "Adaeze Okafor", amountKobo: 16_500_000, method: "card", provider: "paystack", providerReference: "vl_7kq3pm_01", status: "successful", paidAt: "2026-11-18T10:45:00Z", receiptNumber: "RCT-2026-000041" },
  ],
  history: [
    { at: "2026-11-18T10:42:00Z", label: "Reservation created on the website" },
    { at: "2026-11-18T10:45:00Z", label: "Payment verified with Paystack", note: "₦165,000 · card" },
    { at: "2026-11-18T10:45:00Z", label: "Confirmed" },
    { at: "2026-11-30T16:10:00Z", label: "Room 204 assigned", by: "Front desk · Bisi" },
  ],
};

export const payments: PaymentRow[] = [
  reservationDetail.payments[0]!,
  { id: "p2", reservationReference: "VL-M4RD8C", guestName: "Grace Adeyemi", amountKobo: 12_000_000, method: "cash", provider: "offline", status: "successful", paidAt: "2026-11-28T14:05:00Z", receiptNumber: "RCT-2026-000039", recordedBy: "Bisi" },
  { id: "p3", reservationReference: "VL-P8WN2E", guestName: "Ibrahim Musa", amountKobo: 120_000_000, method: "bank_transfer", provider: "offline", providerReference: "TRF-88213", status: "successful", paidAt: "2026-11-20T12:30:00Z", receiptNumber: "RCT-2026-000031", recordedBy: "Kemi (GM)" },
  { id: "p4", reservationReference: "VL-H2X9TA", guestName: "Tunde Bakare", amountKobo: 8_500_000, method: "card", provider: "paystack", providerReference: "vl_h2x9ta_01", status: "abandoned" },
  { id: "p5", reservationReference: "VL-C6TB5Q", guestName: "Chioma Eze", amountKobo: 8_000_000, method: "card", provider: "paystack", providerReference: "vl_c6tb5q_01", status: "successful", paidAt: "2026-11-29T09:12:00Z", receiptNumber: "RCT-2026-000040" },
];

const roomStates: Array<Pick<RoomTile, "state" | "readiness" | "guestName" | "until" | "note">> = [
  { state: "occupied", readiness: "ready", guestName: "Grace Adeyemi", until: "1 Dec" },
  { state: "available", readiness: "ready" },
  { state: "dirty", readiness: "needs_cleaning" },
  { state: "arriving", readiness: "ready", guestName: "Adaeze Okafor" },
  { state: "available", readiness: "ready" },
  { state: "dirty", readiness: "cleaning_in_progress" },
  { state: "maintenance", readiness: "ready", note: "AC repair" },
];

export const rooms: RoomTile[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ n: 101 + i, c: "Standard" })),
  ...Array.from({ length: 9 }, (_, i) => ({ n: 201 + i, c: "Deluxe" })),
  ...Array.from({ length: 5 }, (_, i) => ({ n: 301 + i, c: "Suite" })),
  ...Array.from({ length: 3 }, (_, i) => ({ n: 401 + i, c: "Apartment" })),
].map(({ n, c }, i) => ({ id: `room-${n}`, number: String(n), category: c, floor: String(n)[0], ...roomStates[(i * 5) % roomStates.length]! }));

export const categories: CategoryRow[] = [
  { id: "c1", name: "Standard", slug: "standard", nightlyRateKobo: 5_500_000, maxOccupancy: 2, rooms: 12, images: 0, isActive: true },
  { id: "c2", name: "Deluxe", slug: "deluxe", nightlyRateKobo: 7_500_000, maxOccupancy: 2, rooms: 9, images: 0, isActive: true },
  { id: "c3", name: "Suite", slug: "suite", nightlyRateKobo: 10_800_000, maxOccupancy: 3, rooms: 5, images: 0, isActive: true },
  { id: "c4", name: "Apartment", slug: "apartment", nightlyRateKobo: 23_000_000, maxOccupancy: 4, rooms: 3, images: 0, isActive: true },
];

export const guests: GuestRow[] = [
  { id: "g1", name: "Adaeze Okafor", email: "adaeze@example.com", phone: "+234 803 000 0001", stays: 3, lastStay: "2026-12-01", totalPaidKobo: 41_000_000 },
  { id: "g2", name: "Ibrahim Musa", email: "ibrahim@example.com", phone: "+234 805 000 0004", stays: 1, lastStay: "2026-11-20", totalPaidKobo: 120_000_000 },
  { id: "g3", name: "Grace Adeyemi", phone: "+234 807 000 0003", stays: 2, lastStay: "2026-11-28", totalPaidKobo: 20_000_000 },
  { id: "g4", name: "Tunde Bakare", email: "tunde@example.com", phone: "+234 806 000 0002", stays: 0, totalPaidKobo: 0 },
];

export const staff: StaffRow[] = [
  { id: "s1", name: "Victoria Owner", email: "owner@example.com", role: "owner", isActive: true, lastSignIn: "2026-12-01T08:02:00Z", lastSeen: "2026-12-01T08:02:00Z" },
  { id: "s2", name: "Kemi Ade", email: "gm@example.com", role: "general_manager", isActive: true, lastSignIn: "2026-11-28T07:45:00Z", lastSeen: "2026-11-28T07:45:00Z" },
  { id: "s3", name: "Bisi Lawal", email: "frontdesk1@example.com", role: "front_desk", isActive: true, lastSignIn: "2026-12-01T06:58:00Z", lastSeen: "2026-12-01T06:58:00Z" },
  { id: "s5", name: "Tunde Bello", email: "frontdesk3@example.com", role: "front_desk", isActive: true, invited: true },
  { id: "s4", name: "Femi Ojo", email: "frontdesk2@example.com", role: "front_desk", isActive: false },
];

export const activity: ActivityRow[] = [
  { id: "a1", at: "2026-12-01T09:14:00Z", actor: "Bisi Lawal", action: "room.status_updated", summary: "Room 103 marked ready" },
  { id: "a2", at: "2026-12-01T08:55:00Z", actor: "Kemi Ade", action: "reservation.payment_override", summary: "VL-H2X9TA hold extended to 6pm: guest paying by transfer" },
  { id: "a3", at: "2026-12-01T08:30:00Z", actor: "System", action: "payment.verified", summary: "Paystack payment verified for VL-Q9EV4H (₦170,000)" },
  { id: "a4", at: "2026-11-30T16:10:00Z", actor: "Bisi Lawal", action: "reservation.room_assigned", summary: "Room 204 assigned to VL-7KQ3PM" },
  { id: "a5", at: "2026-11-30T11:02:00Z", actor: "Victoria Owner", action: "staff.updated", summary: "Femi Ojo deactivated" },
];

export const availability: AvailabilityOption[] = [
  { slug: "standard", name: "Standard", summary: "Comfortable, well-appointed rooms for a restful stay.", maxOccupancy: 2, isAvailable: true, nightlyRateKobo: 5_500_000, totalKobo: 11_000_000, nights: 2 },
  { slug: "deluxe", name: "Deluxe", summary: "More room to relax, for guests who want a little extra.", maxOccupancy: 2, isAvailable: true, nightlyRateKobo: 7_500_000, totalKobo: 15_000_000, nights: 2 },
  { slug: "suite", name: "Suite", summary: "Generous space for a stay that feels truly special.", maxOccupancy: 3, isAvailable: true, nightlyRateKobo: 10_800_000, totalKobo: 21_600_000, nights: 2 },
  { slug: "apartment", name: "Apartment", summary: "Self-contained living for families and long stays.", maxOccupancy: 4, isAvailable: false, nightlyRateKobo: 23_000_000, totalKobo: 46_000_000, nights: 2 },
];
