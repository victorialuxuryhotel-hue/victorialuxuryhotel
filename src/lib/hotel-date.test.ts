import { describe, expect, it } from "vitest";
import { businessDate, businessDayStart, businessDaySql } from "./hotel-date";

describe("restaurant & bar trading day", () => {
  it("runs 05:00 to 05:00 Lagos time, so late-night sales belong to the night before", () => {
    expect(businessDate(new Date("2026-11-24T23:30:00Z"))).toBe("2026-11-24");
    expect(businessDate(new Date("2026-11-25T00:30:00Z"))).toBe("2026-11-24");
    expect(businessDate(new Date("2026-11-25T03:59:00Z"))).toBe("2026-11-24");
    expect(businessDate(new Date("2026-11-25T04:00:00Z"))).toBe("2026-11-25");
    expect(businessDayStart("2026-11-25")).toBe("2026-11-25T04:00:00.000Z");
    expect(businessDaySql("o.paid_at")).toBe("date(o.paid_at, '-4 hours')");
  });
});
