import { describe, expect, it } from "vitest";
import { stayIcs } from "./ics";

describe("stay calendar file", () => {
  it("runs from check-in to check-out time, Lagos converted to UTC", () => {
    const ics = stayIcs(
      { reference: "VL-7KQ3PM", category: "Deluxe", checkIn: "2026-12-01", checkOut: "2026-12-03", checkInTime: "14:00:00", checkOutTime: "12:00", url: "https://victorialuxuryhotel.com/book/confirmation/x" },
      new Date("2026-11-22T10:00:00Z"),
    );
    expect(ics).toContain("DTSTART:20261201T130000Z");
    expect(ics).toContain("DTEND:20261203T110000Z");
    expect(ics).toContain("UID:VL-7KQ3PM@victorialuxuryhotel.com");
    expect(ics).toContain("LOCATION:Block XVI\\, Plot 40\\, Alagbaka GRA\\, Akure\\, Ondo State");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });

  it("handles a check-in before 1am Lagos (previous UTC day)", () => {
    const ics = stayIcs({ reference: "R", category: "C", checkIn: "2026-12-01", checkOut: "2026-12-02", checkInTime: "00:30", checkOutTime: "12:00", url: "u" });
    expect(ics).toContain("DTSTART:20261130T233000Z");
  });
});
