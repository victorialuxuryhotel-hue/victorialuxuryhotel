import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { bookingConfirmedEmail, paymentReceivedEmail } = await import("./templates");

const stay = {
  guestName: "Adaeze Okafor", reference: "VL-7KQ3PM", category: "Deluxe", checkIn: "2026-12-01", checkOut: "2026-12-03",
  nights: 2, guests: 2, totalKobo: 11_000_000, paidKobo: 11_000_000, checkInTime: "2:00 pm", checkOutTime: "12:00 noon",
};
const site = "https://victorialuxuryhotel.com";

describe("guest emails (6f / 6g)", () => {
  it("booking confirmed: reference box, times, directions and WhatsApp, matching plain text", () => {
    const e = bookingConfirmedEmail({ ...stay, receiptNumber: "RCT-2026-000412" }, site);
    expect(e.subject).toBe("Booking confirmed: VL-7KQ3PM");
    for (const s of ["You&#39;re booked, Adaeze", "Booking reference", "Show this at the front desk", "from 2:00 pm", "by 12:00 noon", "Get directions", "Message us on WhatsApp", "RCT-2026-000412"]) {
      expect(e.html).toContain(s);
    }
    expect(e.text).toContain("Booking reference: VL-7KQ3PM (Show this at the front desk)");
    expect(e.text).toContain("Get directions: https://maps.app.goo.gl/");
    expect(e.html.toLowerCase()).not.toContain("photo id");
    if (process.env.EMAIL_OUT) writeFileSync(`${process.env.EMAIL_OUT}/email-6f-confirmed.html`, e.html);
  });

  it("shows the assigned room number and floor once there is one", () => {
    const e = bookingConfirmedEmail({ ...stay, room: "Room 204 · Floor 2" }, site);
    expect(e.html).toContain("Room 204 · Floor 2 · Deluxe");
    expect(e.text).toContain("Room 204 · Floor 2 · Deluxe");
    expect(bookingConfirmedEmail(stay, site).text).not.toContain("Floor");
  });

  it("payment receipt: amount box with method and time, balance, receipt link", () => {
    const e = paymentReceivedEmail(
      { ...stay, totalKobo: 8_500_000, paidKobo: 8_500_000, category: "Suite", nights: 1, amountKobo: 8_500_000, receiptNumber: "RCT-2026-000418", method: "Cash", paidAt: "2026-12-01T08:14:00.000Z", receiptUrl: `${site}/book/receipt/token/RCT-2026-000418` },
      site,
    );
    for (const s of ["Amount received", "₦85,000", "Cash · 1 Dec, 09:14", "Balance due", "₦0", "View or print receipt", "Keep this email as your receipt"]) {
      expect(e.html).toContain(s);
    }
    expect(e.text).toContain("View or print receipt: https://victorialuxuryhotel.com/book/receipt/token/RCT-2026-000418");
    if (process.env.EMAIL_OUT) writeFileSync(`${process.env.EMAIL_OUT}/email-6g-receipt.html`, e.html);
  });

  it("partly paid booking says what's still due", () => {
    const e = bookingConfirmedEmail({ ...stay, paidKobo: 5_000_000 }, site);
    expect(e.html).toContain("Balance due");
    expect(e.html).toContain("₦60,000");
  });
});
