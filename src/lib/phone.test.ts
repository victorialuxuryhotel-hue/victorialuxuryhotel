import { describe, expect, it } from "vitest";
import { localDigits, phoneMatches } from "./phone";

describe("phone matching", () => {
  it("normalises Nigerian formats", () => {
    expect(localDigits("+234 803 412 7781")).toBe("08034127781");
    expect(localDigits("2348034127781")).toBe("08034127781");
    expect(localDigits("0803-412-7781")).toBe("08034127781");
    expect(localDigits("002348034127781")).toBe("08034127781");
  });
  it("matches partial input from 7 digits, in any format", () => {
    expect(phoneMatches("+234 803 412 7781", "0803 412")).toBe(true);
    expect(phoneMatches("08034127781", "+234 803 412 7")).toBe(true);
    expect(phoneMatches("08034127781", "080341")).toBe(false);
    expect(phoneMatches("08034127781", "0812 900 3")).toBe(false);
    expect(phoneMatches(null, "08034127781")).toBe(false);
  });
});
