import { describe, expect, it } from "vitest";
import { twoStepOptional, twoStepState } from "./two-step";

describe("two-step sign-in", () => {
  it("is required for owner, general manager, hotel manager and finance only", () => {
    for (const role of ["owner", "general_manager", "hotel_manager", "finance"] as const) expect(twoStepState(role, false, -1)).toBe("setup");
    for (const role of ["front_desk", "restaurant_bar", "restaurant_bar_manager"] as const) expect(twoStepState(role, false, -1)).toBeUndefined();
  });

  it("passes only when the app is set up and this session used it", () => {
    expect(twoStepState("finance", true, 0)).toBeUndefined();
    expect(twoStepState("finance", true, 120)).toBeUndefined();
    expect(twoStepState("finance", true, -1)).toBe("signin");
    expect(twoStepState("finance", true, null)).toBe("signin");
    expect(twoStepState("owner", false, 5)).toBe("setup");
  });

  it("can be switched off only on a local machine", () => {
    expect(twoStepOptional("1", "http://localhost:3000")).toBe(true);
    expect(twoStepOptional("1", "http://127.0.0.1:8787")).toBe(true);
    expect(twoStepOptional("1", "https://victorialuxuryhotel.com")).toBe(false);
    expect(twoStepOptional("1", "http://localhost.evil.com")).toBe(false);
    expect(twoStepOptional("1", undefined)).toBe(false);
    expect(twoStepOptional("0", "http://localhost:3000")).toBe(false);
  });
});
