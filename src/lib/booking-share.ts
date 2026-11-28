import { formatDate } from "./format";

/**
 * "Send to WhatsApp" on the booking-confirmed page (G7, M8; FUNCTIONALITY.md section 10): a wa.me
 * share link the guest sends to themselves or anyone they choose. Nothing is sent by the server.
 * It carries the reference, the dates and the "My booking" link, never the private booking link.
 */
export function bookingShareText(b: { hotelName: string; reference: string; checkIn: string; checkOut: string; checkInTime: string; checkOutTime: string; siteUrl: string }): string {
  return [
    `My booking at ${b.hotelName}`,
    `Reference: ${b.reference}`,
    `Arrive: ${formatDate(b.checkIn, { year: false })}, ${b.checkInTime}`,
    `Leave: ${formatDate(b.checkOut, { year: false })}, ${b.checkOutTime}`,
    `My booking: ${b.siteUrl.replace(/\/+$/, "")}/account`,
  ].join("\n");
}

export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
