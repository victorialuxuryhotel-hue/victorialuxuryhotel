import { hotel } from "@/config/hotel";

export type IcsStay = { reference: string; category: string; checkIn: string; checkOut: string; checkInTime: string; checkOutTime: string; url: string };

function utcStamp(date: string, time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const t = new Date(`${date}T00:00:00Z`).getTime() + (h - 1) * 3_600_000 + m * 60_000; // Lagos = UTC+1
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function stayIcs(s: IcsStay, now = new Date()): string {
  const address = `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Victoria Luxury Hotel//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${s.reference}@victorialuxuryhotel.com`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${utcStamp(s.checkIn, s.checkInTime)}`,
    `DTEND:${utcStamp(s.checkOut, s.checkOutTime)}`,
    `SUMMARY:${esc(`Stay at ${hotel.shortName} · ${s.category}`)}`,
    `LOCATION:${esc(address)}`,
    `DESCRIPTION:${esc(`Booking reference ${s.reference}. Show it at the front desk. Questions: ${hotel.phoneDisplay} or WhatsApp. ${s.url}`)}`,
    `URL:${s.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
