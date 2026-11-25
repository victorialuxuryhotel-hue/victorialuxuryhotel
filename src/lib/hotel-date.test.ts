import { describe, expect, it } from "vitest";
import { businessDate, businessDayLabel, businessDayStart, businessDaySql } from "./hotel-date";

describe("business day", () => {
  it("runs 06:00 to 06:00 Lagos time, so late-night sales belong to the night before", () => {
    expect(businessDate(new Date("2026-11-24T23:30:00Z"))).toBe("2026-11-24");
    expect(businessDate(new Date("2026-11-25T00:25:00Z"))).toBe("2026-11-24"); // 01:25 Lagos
    expect(businessDate(new Date("2026-11-25T04:59:00Z"))).toBe("2026-11-24"); // 05:59 Lagos
    expect(businessDate(new Date("2026-11-25T05:00:00Z"))).toBe("2026-11-25"); // 06:00 Lagos
    expect(businessDayStart("2026-11-25")).toBe("2026-11-25T05:00:00.000Z");
    expect(businessDaySql("o.paid_at")).toBe("date(o.paid_at, '-5 hours')");
  });

  it("says which day and when it ends", () => {
    expect(businessDayLabel("2026-11-24")).toBe("Business day Tue 24 Nov (ends 06:00)");
  });
});
