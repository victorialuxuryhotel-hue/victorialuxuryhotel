import "server-only";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira, plural } from "@/lib/format";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const NAVY = "#021c6c";
const GOLD = "#cc8a0c";
const INK = "#171b24";
const MUTED = "#4b5260";
const LINE = "#e6e0d2";

type Button = { label: string; href: string };
type Feature = { label: string; value: string; sub?: string };

function layout(opts: { preheader: string; heading: string; intro: string; feature?: Feature; rows: Array<[string, string]>; buttons?: Button[]; note?: string; siteUrl: string }) {
  const rows = opts.rows
    .map(([k, v]) => `<tr><td style="padding:11px 0;color:${MUTED};font-size:15px;border-bottom:1px solid ${LINE}">${esc(k)}</td><td style="padding:11px 0;color:${INK};font-size:15px;text-align:right;border-bottom:1px solid ${LINE}">${esc(v)}</td></tr>`)
    .join("");
  const feature = opts.feature
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;border:1px solid ${GOLD};border-radius:4px"><tr><td style="padding:16px;text-align:center">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${esc(opts.feature.label)}</div>
  <div style="margin-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:1px;color:${NAVY}">${esc(opts.feature.value)}</div>
  ${opts.feature.sub ? `<div style="margin-top:4px;font-size:14px;color:${MUTED}">${esc(opts.feature.sub)}</div>` : ""}
</td></tr></table>`
    : "";
  const buttons = (opts.buttons ?? [])
    .map((b, i) => `<tr><td style="padding-top:${i ? 10 : 22}px"><a href="${esc(b.href)}" style="display:block;padding:14px 12px;border:1px solid ${i ? "#cfc8b8" : NAVY};border-radius:4px;text-align:center;font-size:16px;line-height:20px;color:${i ? INK : NAVY};text-decoration:none">${esc(b.label)}</a></td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f8f5ee;font-family:Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ee;padding:20px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:4px">
<tr><td style="padding:24px 24px 18px;text-align:center;border-bottom:1px solid ${LINE}">
  <img src="${opts.siteUrl}/brand/logo-mark.png" width="40" height="40" alt="" style="display:block;margin:0 auto 8px">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${NAVY}">Victoria Luxury</div>
  <div style="margin-top:3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${GOLD}">Hotel &amp; Apartment · Akure</div>
</td></tr>
<tr><td style="padding:24px 24px 8px">
  <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.15;color:${NAVY}">${esc(opts.heading)}</h1>
  <p style="margin:10px 0 0;font-size:16px;line-height:1.55;color:#353b47">${esc(opts.intro)}</p>
  ${feature}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${rows}</table>
  ${buttons ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${buttons}</table>` : ""}
  ${opts.note ? `<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${MUTED}">${esc(opts.note)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 24px 22px;border-top:1px solid ${LINE};text-align:center;font-size:13px;line-height:1.7;color:${MUTED}">
  ${esc(hotel.name)}<br>
  ${esc(hotel.address.line1)}, ${esc(hotel.address.city)}, ${esc(hotel.address.state)}<br>
  <a href="tel:${hotel.phone}" style="color:${GOLD}">Call</a> · <a href="https://wa.me/${hotel.whatsapp}" style="color:${GOLD}">WhatsApp</a> · <a href="mailto:${hotel.email}" style="color:${GOLD}">Email</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

const text = (heading: string, intro: string, rows: Array<[string, string]>, note?: string, feature?: Feature, buttons: Button[] = []) =>
  [
    heading, "", intro, "",
    ...(feature ? [`${feature.label}: ${feature.value}${feature.sub ? ` (${feature.sub})` : ""}`, ""] : []),
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(buttons.length ? ["", ...buttons.map((b) => `${b.label}: ${b.href}`)] : []),
    ...(note ? ["", note] : []),
    "", hotel.name, `${hotel.address.line1}, ${hotel.address.city}`, `Call ${hotel.phoneDisplay} · WhatsApp https://wa.me/${hotel.whatsapp} · ${hotel.email}`,
  ].join("\n");

const whatsapp: Button = { label: "Message us on WhatsApp", href: `https://wa.me/${hotel.whatsapp}` };

export type StayInfo = {
  guestName: string;
  reference: string;
  category: string;
  room?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totalKobo: number;
  paidKobo: number;
  checkInTime: string;
  checkOutTime: string;
};

const roomText = (s: { category: string; room?: string }) => (s.room ? `${s.room} · ${s.category}` : s.category);

const stayRows = (s: StayInfo): Array<[string, string]> => [
  ["Booking reference", s.reference],
  ["Room", roomText(s)],
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
      ? `Your ${s.category} room is confirmed. ${formatNaira(balance)} is still to be paid; our team will arrange this with you.`
      : `Your payment has been received and your ${s.category} room is confirmed. We look forward to welcoming you to Akure.`;
  const feature: Feature = { label: "Booking reference", value: s.reference, sub: "Show this at the front desk" };
  const rows: Array<[string, string]> = [
    ["Check-in", `${formatDate(s.checkIn)}, from ${s.checkInTime}`],
    ["Check-out", `${formatDate(s.checkOut)}, by ${s.checkOutTime}`],
    ["Room", `${roomText(s)} · ${plural(s.guests, "guest")}`],
    [balance > 0 ? "Paid so far" : "Total paid", formatNaira(s.paidKobo)],
    ...(balance > 0 ? [["Balance due", formatNaira(balance)] as [string, string]] : []),
    ...(s.receiptNumber ? [["Receipt", s.receiptNumber] as [string, string]] : []),
  ];
  const buttons: Button[] = [{ label: "Get directions", href: hotel.mapsUrl }, whatsapp];
  const note = "Need to change anything or arriving late? Reply to this email or message us on WhatsApp.";
  return {
    subject: `Booking confirmed: ${s.reference}`,
    html: layout({ preheader: `${s.category}, ${formatDate(s.checkIn)} to ${formatDate(s.checkOut)}`, heading, intro, feature, rows, buttons, note, siteUrl }),
    text: text(heading, intro, rows, note, feature, buttons),
  };
}

export function paymentReceivedEmail(
  s: StayInfo & { amountKobo: number; receiptNumber: string; method: string; paidAt?: string | null; receiptUrl?: string | null },
  siteUrl: string,
) {
  const balance = Math.max(0, s.totalKobo - s.paidKobo);
  const heading = "Payment received";
  const intro = `Thank you, ${first(s.guestName)}. We've received your payment for your stay.`;
  const when = s.paidAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(s.paidAt)) : null;
  const feature: Feature = { label: "Amount received", value: formatNaira(s.amountKobo), sub: when ? `${s.method} · ${when}` : s.method };
  const rows: Array<[string, string]> = [
    ["Receipt", s.receiptNumber],
    ["Booking", s.reference],
    ["Room", `${roomText(s)} · ${plural(s.nights, "night")}`],
    ["Total", formatNaira(s.totalKobo)],
    ["Balance due", formatNaira(balance)],
  ];
  const buttons: Button[] = [...(s.receiptUrl ? [{ label: "View or print receipt", href: s.receiptUrl }] : []), whatsapp];
  const note = "Keep this email as your receipt. If anything looks wrong, reply and our team will check it.";
  return {
    subject: `Payment received: ${s.reference}`,
    html: layout({ preheader: `Receipt ${s.receiptNumber} · ${formatNaira(s.amountKobo)}`, heading, intro, feature, rows, buttons, note, siteUrl }),
    text: text(heading, intro, rows, note, feature, buttons),
  };
}

export function reservationCancelledEmail(s: StayInfo, siteUrl: string) {
  const heading = "Your reservation has been cancelled";
  const intro = `Hello ${first(s.guestName)}, reservation ${s.reference} has been cancelled.`;
  const rows: Array<[string, string]> = [["Booking reference", s.reference], ["Room", s.category], ["Dates", `${formatDate(s.checkIn)} to ${formatDate(s.checkOut)}`]];
  const note = s.paidKobo > 0 ? "If a refund is due under our cancellation policy, the hotel will contact you about it." : "If you didn't expect this, please contact us.";
  const buttons = [whatsapp];
  return {
    subject: `Reservation cancelled: ${s.reference}`,
    html: layout({ preheader: `Reservation ${s.reference} cancelled`, heading, intro, rows, buttons, note, siteUrl }),
    text: text(heading, intro, rows, note, undefined, buttons),
  };
}

export function hotelNewBookingEmail(s: StayInfo, source: string, siteUrl: string) {
  const heading = "New confirmed booking";
  const intro = `${s.guestName} has a confirmed ${s.category} booking (${source}).`;
  const rows = stayRows(s);
  return { subject: `New booking ${s.reference}: ${formatDate(s.checkIn)}`, html: layout({ preheader: intro, heading, intro, rows, siteUrl }), text: text(heading, intro, rows) };
}

export function guestCodeEmail(code: string, siteUrl: string) {
  const heading = "Your sign-in code";
  const intro = "Enter this code on the Victoria Luxury website to see and manage your bookings. It expires in 15 minutes.";
  const note = "If you didn't ask for this code, you can ignore this email.";
  return {
    subject: `Your Victoria Luxury code: ${code}`,
    html: layout({ preheader: `Your code is ${code}`, heading, intro, feature: { label: "Sign-in code", value: code }, rows: [], note, siteUrl }),
    text: text(heading, intro, [["Sign-in code", code]], note),
  };
}
