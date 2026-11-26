import { describe, expect, it } from "vitest";
import { businessDate, businessDayLabel, businessDayStart, businessDayNow, businessDaySql, hotelToday, tonight } from "./hotel-date";

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

describe("tonight (the first night a booking can start)", () => {
  it("is still last night until the 06:00 cut-off, then today", () => {
    const at2am = new Date("2026-11-26T01:00:00Z"); // 02:00 Lagos on the 26th
    expect(hotelToday(at2am)).toBe("2026-11-26");
    expect(tonight(at2am)).toBe("2026-11-25");
    expect(tonight(new Date("2026-11-26T04:59:59Z"))).toBe("2026-11-25"); // 05:59:59
    expect(tonight(new Date("2026-11-26T05:00:00Z"))).toBe("2026-11-26"); // 06:00
    expect(tonight(new Date("2026-11-25T22:59:00Z"))).toBe("2026-11-25"); // 23:59 the night before
  });
});

describe("business day now (sidebar and till)", () => {
  it("shows the date; after midnight the previous one, until 06:00", () => {
    expect(businessDayNow(new Date("2026-11-24T14:00:00Z"))).toBe("Business day · Tue 24 Nov");
    expect(businessDayNow(new Date("2026-11-24T23:30:00Z"))).toBe("Business day · Tue 24 Nov (until 06:00)"); // 00:30 on the 25th
    expect(businessDayNow(new Date("2026-11-25T04:59:00Z"))).toBe("Business day · Tue 24 Nov (until 06:00)");
    expect(businessDayNow(new Date("2026-11-25T05:00:00Z"))).toBe("Business day · Wed 25 Nov");
  });
});

