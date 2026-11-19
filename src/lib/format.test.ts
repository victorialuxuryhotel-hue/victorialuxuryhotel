import { describe, expect, it } from "vitest";
import { formatDate, formatNaira, nightsBetween } from "./format";

describe("format", () => {
  it("formats kobo as whole naira", () => {
    expect(formatNaira(4_000_000)).toMatch(/40,000/);
    expect(formatNaira(4_000_000)).toMatch(/₦|NGN/);
  });

  it("formats ISO dates without timezone drift", () => {
    expect(formatDate("2026-12-01")).toMatch(/^Tue,? 1 Dec 2026$/);
  });

  it("counts nights, including across a month end", () => {
    expect(nightsBetween("2026-11-29", "2026-12-02")).toBe(3);
  });
});
