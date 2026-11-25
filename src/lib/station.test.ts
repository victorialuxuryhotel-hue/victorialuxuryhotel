import { describe, expect, it } from "vitest";
import { parseStation, shouldAutoPrint, stationDefaults } from "./station";

describe("station settings", () => {
  it("defaults to A4 with no automatic printing", () => {
    expect(parseStation(null)).toEqual({ counter: null, printLayout: "a4", autoPrint: false });
    expect(parseStation("not json")).toEqual(stationDefaults);
    expect(parseStation(JSON.stringify({ printLayout: "letter", counter: "kitchen" }))).toEqual(stationDefaults);
  });

  it("80mm turns auto-print on unless it was switched off; 'don't print' never prints", () => {
    expect(parseStation(JSON.stringify({ printLayout: "80mm" }))).toMatchObject({ printLayout: "80mm", autoPrint: true });
    expect(parseStation(JSON.stringify({ printLayout: "80mm", autoPrint: false })).autoPrint).toBe(false);
    expect(parseStation(JSON.stringify({ printLayout: "none", autoPrint: true })).autoPrint).toBe(false);
    expect(parseStation(JSON.stringify({ counter: "restaurant" })).counter).toBe("restaurant");
  });

  it("auto-prints each receipt once, never on a re-render or a retry", () => {
    const bar = parseStation(JSON.stringify({ printLayout: "80mm" }));
    const printed = new Set<string>();
    expect(shouldAutoPrint(bar, "RB-2026-000017", printed)).toBe(true);
    printed.add("RB-2026-000017");
    expect(shouldAutoPrint(bar, "RB-2026-000017", printed)).toBe(false);
    expect(shouldAutoPrint(bar, "RB-2026-000018", printed)).toBe(true);
    expect(shouldAutoPrint(bar, null, printed)).toBe(false);
    expect(shouldAutoPrint(stationDefaults, "RB-2026-000019", printed)).toBe(false);
  });
});
