import { describe, expect, it } from "vitest";
import { faqJsonLd, hotelFaqs, hotelJsonLd, ldJson } from "./seo";

const rooms = [
  { slug: "standard", name: "Standard", summary: "", maxOccupancy: 2, fromRateKobo: 5_500_000 },
  { slug: "apartment", name: "Apartment", summary: "Living room and kitchen", maxOccupancy: 4, fromRateKobo: 23_000_000 },
];

describe("structured data", () => {
  it("describes the hotel with confirmed facts and live prices", () => {
    const h = hotelJsonLd(rooms, { checkInTime: "14:00:00", checkOutTime: "12:00" });
    expect(h["@type"]).toBe("Hotel");
    expect(h.alternateName).toContain("Victoria Luxury Hotel and Apartments");
    expect(h.address.addressLocality).toBe("Akure");
    expect(h.checkinTime).toBe("14:00");
    expect(h.priceRange).toBe("₦55,000 – ₦230,000 per night");
    expect(h.makesOffer.map((o) => o.price)).toEqual([55000, 230000]);
    expect(h.amenityFeature.map((a) => a.name)).toContain("Club");
  });
  it("builds FAQs and escapes script-closing text", () => {
    const f = faqJsonLd(hotelFaqs({ checkInTime: "14:00", checkOutTime: "12:00" }, "Free cancellation up to 48 hours before check-in."));
    expect(f.mainEntity).toHaveLength(6);
    expect(ldJson({ a: "</script>" })).not.toContain("</script>");
  });
});
