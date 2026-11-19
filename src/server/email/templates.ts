import "server-only";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira, plural } from "@/lib/format";

/**
 * Transactional email templates. Table-based, inline-styled HTML that renders
 * in Gmail, Outlook and Apple Mail, plus a plain-text part. Everything shown is
 * escaped; amounts and dates come from the database.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const NAVY = "#021c6c";
const GOLD = "#cc8a0c";

function layout(opts: { preheader: string; heading: string; intro: string; rows: Array<[string, string]>; note?: string; siteUrl: string }) {
  const rows = opts.rows
    .map(([k, v]) => `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #efe9dc">${esc(k)}</td><td style="padding:10px 0;color:#171b24;font-size:14px;text-align:right;border-bottom:1px solid #efe9dc">${esc(v)}</td></tr>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f8f5ee;font-family:Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ee;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${NAVY};padding:28px 32px;text-align:center">
  <img src="${opts.siteUrl}/brand/logo-mark.png" width="44" alt="" style="display:block;margin:0 auto 10px">
  <div style="font-family:Georgia,serif;font-size:22px;color:#ffffff">Victoria Luxury</div>
  <div style="font-size:10px;letter-spacing:3px;color:#edc152;text-transform:uppercase;margin-top:4px">Hotel &amp; Apartment</div>
</td></tr>
<tr><td style="padding:32px">
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${NAVY};margin:0 0 12px">${esc(opts.heading)}</h1>
  <p style="font-size:15px;line-height:1.6;color:#353b47;margin:0 0 24px">${esc(opts.intro)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  ${opts.note ? `<p style="font-size:14px;line-height:1.6;color:#4b5260;margin:24px 0 0">${esc(opts.note)}</p>` : ""}
</td></tr>
<tr><td style="background:#fdf8ea;padding:20px 32px;font-size:13px;line-height:1.6;color:#4b5260">
  <strong style="color:${NAVY}">${esc(hotel.name)}</strong><br>
  ${esc(hotel.address.line1)}, ${esc(hotel.address.city)}, ${esc(hotel.address.state)}<br>
  <a href="tel:${hotel.phone}" style="color:${GOLD}">${esc(hotel.phoneDisplay)}</a> · <a href="https://wa.me/${hotel.whatsapp}" style="color:${GOLD}">WhatsApp</a> · <a href="mailto:${hotel.email}" style="color:${GOLD}">${esc(hotel.email)}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

const text = (heading: string, intro: string, rows: Array<[string, string]>, note?: string) =>
  [heading, "", intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), ...(note ? ["", note] : []), "", hotel.name, `${hotel.address.line1}, ${hotel.address.city}`, `${hotel.phoneDisplay} · ${hotel.email}`].join("\n");

export type StayInfo = {
  guestName: string;
  reference: string;
  category: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totalKobo: number;
  paidKobo: number;
  checkInTime: string;
  checkOutTime: string;
};

const stayRows = (s: StayInfo): Array<[string, string]> => [
  ["Booking reference", s.reference],
  ["Room", s.category],
  ["Check-in", `${formatDate(s.checkIn)}, from ${s.checkInTime}`],
  ["Check-out", `${formatDate(s.checkOut)}, by ${s.checkOutTime}`],
  ["Guests", String(s.guests)],
  ["Total", `${formatNaira(s.totalKobo)} (${plural(s.nights, "night")})`],
  ["Paid", formatNaira(s.paidKobo)],
];

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function bookingConfirmedEmail(s: StayInfo & { receiptNumber?: string }, siteUrl: string) {
  const heading = `You're booked, ${first(s.guestName)}`;
  const balance = s.totalKobo - s.paidKobo;
  const intro =
    balance > 0
      ? `Your reservation is confirmed. ${formatNaira(balance)} is still to be paid; our team will arrange this with you. We look forward to welcoming you.`
      : "Your payment has been received and your reservation is confirmed. We look forward to welcoming you.";
  const rows = [...stayRows(s), ...(s.receiptNumber ? [["Receipt", s.receiptNumber] as [string, string]] : [])];
  const note = "Need to change something or arriving late? Reply to this email or contact us on WhatsApp.";
  return {
    subject: `Booking confirmed: ${s.reference}`,
    html: layout({ preheader: `${s.category}, ${formatDate(s.checkIn)} to ${formatDate(s.checkOut)}`, heading, intro, rows, note, siteUrl }),
    text: text(heading, intro, rows, note),
  };
}

export function paymentReceivedEmail(s: StayInfo & { amountKobo: number; receiptNumber: string; method: string }, siteUrl: string) {
  const balance = Math.max(0, s.totalKobo - s.paidKobo);
  const heading = "Payment received";
  const intro = `Thank you, ${first(s.guestName)}. We've received ${formatNaira(s.amountKobo)} for your stay.`;
  const rows: Array<[string, string]> = [["Receipt", s.receiptNumber], ["Amount", formatNaira(s.amountKobo)], ["Method", s.method], ...stayRows(s), ["Balance due", formatNaira(balance)]];
  return {
    subject: `Payment received: ${s.reference}`,
    html: layout({ preheader: `Receipt ${s.receiptNumber}`, heading, intro, rows, siteUrl }),
    text: text(heading, intro, rows),
  };
}

export function reservationCancelledEmail(s: StayInfo, siteUrl: string) {
  const heading = "Your reservation has been cancelled";
  const intro = `Hello ${first(s.guestName)}, reservation ${s.reference} has been cancelled.`;
  const rows: Array<[string, string]> = [["Booking reference", s.reference], ["Room", s.category], ["Dates", `${formatDate(s.checkIn)} to ${formatDate(s.checkOut)}`]];
  const note = s.paidKobo > 0 ? "If a refund is due under our cancellation policy, the hotel will contact you about it." : "If you didn't expect this, please contact us.";
  return {
    subject: `Reservation cancelled: ${s.reference}`,
    html: layout({ preheader: `Reservation ${s.reference} cancelled`, heading, intro, rows, note, siteUrl }),
    text: text(heading, intro, rows, note),
  };
}

export function hotelNewBookingEmail(s: StayInfo, source: string, siteUrl: string) {
  const heading = "New confirmed booking";
  const intro = `${s.guestName} has a confirmed ${s.category} booking (${source}).`;
  const rows = stayRows(s);
  return { subject: `New booking ${s.reference}: ${formatDate(s.checkIn)}`, html: layout({ preheader: intro, heading, intro, rows, siteUrl }), text: text(heading, intro, rows) };
}
