import { describe, expect, it } from "vitest";
import { formatDate, formatNaira, formatRange, nightsBetween, numberWord, publicText, roomLabel } from "./format";

describe("format", () => {
  it("writes a stay as a short range, with the year only when it differs", () => {
    expect(formatRange("2026-11-28", "2026-11-30", "2026")).toBe("28 → 30 Nov");
    expect(formatRange("2026-11-29", "2026-12-02", "2026")).toBe("29 Nov → 2 Dec");
    expect(formatRange("2026-12-30", "2027-01-02", "2026")).toBe("30 Dec 2026 → 2 Jan 2027");
    expect(formatRange("2027-02-01", "2027-02-03", "2026", "–")).toBe("1–3 Feb 2027");
  });

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

  it("shows the year only for dates outside the current year when given it", () => {
    expect(formatDate("2026-12-01", { year: "2026" })).toMatch(/^Tue,? 1 Dec$/);
    expect(formatDate("2027-01-28", { year: "2026" })).toMatch(/^Thu,? 28 Jan 2027$/);
    expect(formatDate("2027-01-28", { year: false })).toMatch(/^Thu,? 28 Jan$/);
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
