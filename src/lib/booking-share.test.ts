import { describe, expect, it } from "vitest";
import { bookingShareText, whatsappShareLink } from "./booking-share";

const booking = {
  hotelName: "Victoria Luxury Hotel and Apartment",
  reference: "VL-7KQ3PM",
  checkIn: "2026-12-05",
  checkOut: "2026-12-07",
  checkInTime: "any time",
  checkOutTime: "by 12:00",
  siteUrl: "https://victorialuxuryhotel.com/",
};

describe("Send to WhatsApp (G7, M8)", () => {
  it("has the reference, the dates and the My booking link", () => {
    expect(bookingShareText(booking)).toBe(
      [
        "My booking at Victoria Luxury Hotel and Apartment",
        "Reference: VL-7KQ3PM",
        "Arrive: Sat 5 Dec, any time",
        "Leave: Mon 7 Dec, by 12:00",
        "My booking: https://victorialuxuryhotel.com/account",
      ].join("\n"),
    );
  });
  it("never carries the private booking link", () => {
    expect(bookingShareText(booking)).not.toMatch(/confirmation|token/);
  });
  it("is a wa.me share link with no number, so the guest picks who gets it", () => {
    expect(whatsappShareLink("Reference: VL-7KQ3PM\nhttps://x.test/account")).toBe(
      "https://wa.me/?text=Reference%3A%20VL-7KQ3PM%0Ahttps%3A%2F%2Fx.test%2Faccount",
    );
  });
});
