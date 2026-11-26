import { describe, expect, it } from "vitest";
import { opensPanel, withBooking, withoutBooking } from "./panel";

describe("booking panel links", () => {
  it("keeps the page's own params and adds or removes the booking", () => {
    expect(withBooking("/app/reservations", { tab: "all", q: "Ade", page: undefined }, "VL-ABC123")).toBe("/app/reservations?tab=all&q=Ade&booking=VL-ABC123");
    expect(withoutBooking("/app/reservations", { tab: "all", booking: "VL-ABC123" })).toBe("/app/reservations?tab=all");
    expect(withoutBooking("/app/today", { booking: "VL-ABC123" })).toBe("/app/today");
    expect(withBooking("/app/calendar", { from: "2026-12-03", booking: "VL-OLD" }, "VL-NEW")).toBe("/app/calendar?from=2026-12-03&booking=VL-NEW");
  });
  it("knows a panel link from a page link", () => {
    expect(opensPanel("/app/today?booking=VL-ABC123")).toBe(true);
    expect(opensPanel("/app/reservations/123")).toBe(false);
  });
});
