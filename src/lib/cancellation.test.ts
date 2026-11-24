import { describe, expect, it } from "vitest";
import { cancellationRuleText, lateFeeKobo } from "./cancellation";

describe("cancellation policy", () => {
  it("reads from the hotel's settings", () => {
    const text = cancellationRuleText(48, 50, "14:00:00");
    expect(text).toContain("Free cancellation up to 48 hours before check-in (check-in is from 14:00).");
    expect(text).toContain("Within 48 hours of check-in, 50% of the room price is charged.");
    expect(text).toContain("If you don't arrive, the booking is forfeited.");
    expect(text).toContain("Extras you didn't use are refunded in full.");
    expect(text).toContain("change your dates for free up to 48 hours before check-in");
    expect(cancellationRuleText(24, 0)).toBe("Free cancellation up to check-in. Refunds go back to the original payment method.");
  });

  it("charges the fee on the room price, rounded to the kobo", () => {
    expect(lateFeeKobo(16_500_000, 50)).toBe(8_250_000);
    expect(lateFeeKobo(5_500_001, 50)).toBe(2_750_001);
    expect(lateFeeKobo(10_000_000, 0)).toBe(0);
  });
});
