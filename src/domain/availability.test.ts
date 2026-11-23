import { describe, expect, it } from "vitest";
import type { AvailabilityOption } from "./views";
import { groupOptions, nearestFreeStart } from "./availability";

const days = (from: string, flags: string) =>
  new Map([...flags].map((f, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return [d.toISOString().slice(0, 10), f === "1"] as const;
  }));

describe("nearestFreeStart", () => {
  it("finds the nearest start with every night free", () => {
    expect(nearestFreeStart(days("2026-12-01", "00000000011000000000"), "2026-12-05", 2, "2026-12-01")).toBe("2026-12-10");
  });
  it("prefers later over earlier at the same distance, and looks earlier too", () => {
    expect(nearestFreeStart(days("2026-12-01", "00110001100000000000"), "2026-12-05", 2, "2026-12-01")).toBe("2026-12-03");
    expect(nearestFreeStart(days("2026-12-01", "00011000110000000000"), "2026-12-07", 2, "2026-12-01")).toBe("2026-12-09");
  });
  it("never suggests a date before today", () => {
    expect(nearestFreeStart(days("2026-12-01", "11000000000000000000"), "2026-12-05", 2, "2026-12-03")).toBeNull();
  });
  it("returns nothing when no run of free nights is long enough within the window", () => {
    expect(nearestFreeStart(days("2026-12-01", "10101010101010101010"), "2026-12-05", 2, "2026-12-01")).toBeNull();
    expect(nearestFreeStart(days("2026-12-01", "00000000000000000001"), "2026-12-01", 1, "2026-12-01", 14)).toBeNull();
  });
});

const opt = (slug: string, maxOccupancy: number, totalKobo: number, isAvailable: boolean): AvailabilityOption => ({
  slug, name: slug, summary: "", maxOccupancy, isAvailable, nightlyRateKobo: totalKobo, totalKobo, nights: 1,
});

describe("groupOptions", () => {
  it("puts free types that fit first by price, full ones after, too small apart", () => {
    const g = groupOptions(
      [opt("suite", 2, 300, true), opt("standard", 2, 100, false), opt("deluxe", 2, 200, true), opt("apartment", 4, 500, true), opt("single", 1, 50, true)],
      2,
    );
    expect(g.available.map((o) => o.slug)).toEqual(["deluxe", "suite", "apartment"]);
    expect(g.full.map((o) => o.slug)).toEqual(["standard"]);
    expect(g.tooSmall.map((o) => o.slug)).toEqual(["single"]);
  });
});
