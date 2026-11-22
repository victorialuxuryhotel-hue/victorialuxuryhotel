import { describe, expect, it } from "vitest";
import { vatIncluded } from "./vat";

describe("VAT included in a price", () => {
  it("takes the VAT part out of a VAT-inclusive amount", () => {
    expect(vatIncluded(10_750_000, 750)).toBe(750_000);
    expect(vatIncluded(5_500_000, 750)).toBe(383_721);
    expect(vatIncluded(5_500_000, 0)).toBe(0);
  });
});
