import { describe, expect, it } from "vitest";
import { stayPrice } from "./pricing";

describe("stay price", () => {
  it("adds extras per stay or per night, and takes a promo off the room only", () => {
    const extras = [{ priceKobo: 1_500_000, perNight: false }, { priceKobo: 500_000, perNight: true }];
    expect(stayPrice({ nightlyRateKobo: 5_500_000, nights: 2, extras, discountPct: 10 })).toEqual({
      roomKobo: 11_000_000, extrasKobo: 2_500_000, discountKobo: 1_100_000, totalKobo: 12_400_000,
    });
  });

  it("the QA case: ₦40,000 room, airport pickup and breakfast for one night is ₦75,000", () => {
    const extras = [{ priceKobo: 2_500_000, perNight: false }, { priceKobo: 1_000_000, perNight: true }];
    expect(stayPrice({ nightlyRateKobo: 4_000_000, nights: 1, extras }).totalKobo).toBe(7_500_000);
  });
});
