import { describe, expect, it } from "vitest";
import { formatDate, formatNaira, nightsBetween, numberWord, publicText, roomLabel } from "./format";

describe("format", () => {
  it("hides unfinished placeholder copy from guests", () => {
    expect(publicText("[Placeholder] Awaiting description")).toBe("");
    expect(publicText(" A calm room ")).toBe("A calm room");
    expect(publicText(null)).toBe("");
  });

  it("labels a room with its floor", () => {
    expect(roomLabel("204", "2")).toBe("Room 204 · Floor 2");
    expect(roomLabel("G1", "Ground")).toBe("Room G1 · Ground floor");
    expect(roomLabel("301", "Top floor")).toBe("Room 301 · Top floor");
    expect(roomLabel("12", null)).toBe("Room 12");
  });

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

describe("numberWord", () => {
  it("spells out small counts and falls back to digits", () => {
    expect([numberWord(1), numberWord(4), numberWord(10), numberWord(12)]).toEqual(["One", "Four", "Ten", "12"]);
  });
});
