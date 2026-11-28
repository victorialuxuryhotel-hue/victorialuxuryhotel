import "server-only";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira, plural } from "@/lib/format";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/* Colours of design E1. */
const NAVY = "#021c6c";
const WORDMARK = "#0b1f5c";
const INK = "#171b24";
const MUTED = "#5b6372";
const LINE = "#e4e0d6";
const IVORY = "#f6f4ef";
const LINK = "#0430a0";

type Button = { label: string; href: string };
type Feature = { label: string; value: string; sub?: string };

/**
 * Every guest email, styled after design E1: an ivory page, a white card with the "Victoria Luxury"
 * wordmark, a bold heading, the details (as a two-column box when `grid` is set), then the buttons.
 */
function layout(opts: { preheader: string; heading: string; intro: string; feature?: Feature; rows: Array<[string, string]>; buttons?: Button[]; note?: string; siteUrl: string; grid?: boolean }) {
  const cell = (label: string, value: string, sub?: string) =>
    `<div style="font-size:11px;font-weight:600;color:${MUTED}">${esc(label)}</div><div style="margin-top:3px;font-size:14px;font-weight:600;color:${INK}">${esc(value)}</div>${sub ? `<div style="margin-top:2px;font-size:12px;color:${MUTED}">${esc(sub)}</div>` : ""}`;
  let details: string;
  if (opts.grid) {
    const cells = [...(opts.feature ? [cell(opts.feature.label, opts.feature.value, opts.feature.sub)] : []), ...opts.rows.map(([k, v]) => cell(k, v))];
    const pairs: string[] = [];
    for (let i = 0; i < cells.length; i += 2) {
      pairs.push(`<tr><td width="50%" valign="top" style="padding:7px 8px 7px 0">${cells[i]}</td><td width="50%" valign="top" style="padding:7px 0 7px 8px">${cells[i + 1] ?? ""}</td></tr>`);
    }
    details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:${IVORY};border-radius:10px"><tr><td style="padding:8px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${pairs.join("")}</table></td></tr></table>`;
  } else {
    const feature = opts.feature
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;background:${IVORY};border-radius:10px"><tr><td style="padding:16px;text-align:center">
  <div style="font-size:11px;font-weight:600;color:${MUTED}">${esc(opts.feature.label)}</div>
  <div style="margin-top:6px;font-size:28px;font-weight:700;letter-spacing:1px;color:${NAVY}">${esc(opts.feature.value)}</div>
  ${opts.feature.sub ? `<div style="margin-top:4px;font-size:14px;color:${MUTED}">${esc(opts.feature.sub)}</div>` : ""}
</td></tr></table>`
      : "";
    const rows = opts.rows
      .map(([k, v]) => `<tr><td style="padding:10px 0;color:${MUTED};font-size:14px;border-bottom:1px solid ${LINE}">${esc(k)}</td><td style="padding:10px 0;color:${INK};font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid ${LINE}">${esc(v)}</td></tr>`)
      .join("");
    details = `${feature}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${rows}</table>`;
  }
  const buttons = (opts.buttons ?? [])
    .map(
      (b, i) =>
        `<a href="${esc(b.href)}" style="display:inline-block;margin:0 8px 10px 0;padding:12px 18px;border:1px solid ${i ? "#cfcabd" : NAVY};border-radius:8px;background:${i ? "#ffffff" : NAVY};font-size:15px;font-weight:600;line-height:20px;color:${i ? INK : "#ffffff"};text-decoration:none">${esc(b.label)}</a>`,
    )
    .join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:${IVORY};font-family:Inter,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:592px;background:#ffffff;border-radius:14px">
<tr><td style="padding:28px 28px 8px">
  <div style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:600;font-size:28px;line-height:1.1;color:${WORDMARK}">Victoria Luxury</div>
  <h1 style="margin:14px 0 0;font-family:Inter,Helvetica,Arial,sans-serif;font-weight:700;font-size:22px;line-height:1.25;color:${INK}">${esc(opts.heading)}</h1>
  <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:${MUTED}">${esc(opts.intro)}</p>
  ${details}
  ${buttons ? `<div style="margin-top:20px">${buttons}</div>` : ""}
  ${opts.note ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:${MUTED}">${esc(opts.note)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px 24px;font-size:12px;line-height:1.7;color:${MUTED}">
  ${esc(hotel.name)} · ${esc(hotel.address.line1)}, ${esc(hotel.address.city)}, ${esc(hotel.address.state)}<br>
  <a href="tel:${hotel.phone}" style="color:${LINK}">Call</a> · <a href="https://wa.me/${hotel.whatsapp}" style="color:${LINK}">WhatsApp</a> · <a href="mailto:${hotel.email}" style="color:${LINK}">Email</a>
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
  ["Check-in", `${formatDate(s.checkIn)}, ${s.checkInTime}`],
  ["Check-out", `${formatDate(s.checkOut)}, ${s.checkOutTime}`],
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
      ? `Your ${s.category} room is confirmed. ${formatNaira(balance)} is owed; our team will arrange this with you.`
      : "Thank you for booking direct. Here are your details. Keep this email: it's your confirmation.";
  const feature: Feature = { label: "Booking reference", value: s.reference, sub: "Show this at the front desk" };
  const rows: Array<[string, string]> = [
    ["Room", `${roomText(s)} · ${plural(s.guests, "guest")}`],
    ["Arrive", `${formatDate(s.checkIn)} · ${s.checkInTime}`],
    ["Leave", `${formatDate(s.checkOut)} · ${s.checkOutTime}`],
    [balance > 0 ? "Paid so far" : "Total paid", formatNaira(s.paidKobo)],
    ...(balance > 0 ? [["Owed", formatNaira(balance)] as [string, string]] : []),
    ...(s.receiptNumber ? [["Receipt", s.receiptNumber] as [string, string]] : []),
  ];
  const buttons: Button[] = [{ label: "Manage your booking", href: `${siteUrl}/account` }, { label: "Get directions", href: hotel.mapsUrl }, whatsapp];
  const note = "Questions? Reply to this email or message the front desk on WhatsApp.";
  return {
    subject: `Booking confirmed: ${s.reference}`,
    html: layout({ preheader: `${s.category}, ${formatDate(s.checkIn)} to ${formatDate(s.checkOut)}`, heading, intro, feature, rows, buttons, note, siteUrl, grid: true }),
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
    ["Owed", balance > 0 ? formatNaira(balance) : "Paid in full"],
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
  const heading = "Your booking has been cancelled";
  const intro = `Hello ${first(s.guestName)}, booking ${s.reference} has been cancelled.`;
  const rows: Array<[string, string]> = [["Booking reference", s.reference], ["Room", s.category], ["Dates", `${formatDate(s.checkIn)} to ${formatDate(s.checkOut)}`]];
  const note = s.paidKobo > 0 ? "If a refund is due under our cancellation policy, the hotel will contact you about it." : "If you didn't expect this, please contact us.";
  const buttons = [whatsapp];
  return {
    subject: `Booking cancelled: ${s.reference}`,
    html: layout({ preheader: `Booking ${s.reference} cancelled`, heading, intro, rows, buttons, note, siteUrl }),
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
