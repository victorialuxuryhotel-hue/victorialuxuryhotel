import { describe, expect, it } from "vitest";
import { checkInWhen, checkOutWhen, stayTimesSentence, timeLabel } from "./stay-times";

describe("stay times as guests read them", () => {
  it("00:00 check-in means any time on the arrival day", () => {
    expect(checkInWhen("00:00")).toBe("any time");
    expect(checkInWhen("14:00:00")).toBe("from 2:00 pm");
    expect(checkOutWhen("12:00")).toBe("by 12:00 noon");
    expect(stayTimesSentence("00:00", "12:00")).toBe("Check in any time on your arrival day. Check-out is by 12:00 noon.");
  });

  it("labels times in 12-hour form", () => {
    expect([timeLabel("09:30"), timeLabel("12:00"), timeLabel("18:05")]).toEqual(["9:30 am", "12:00 noon", "6:05 pm"]);
  });
});
