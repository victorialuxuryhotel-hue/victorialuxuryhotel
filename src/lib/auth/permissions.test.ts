import { describe, expect, it } from "vitest";
import { allowedPaymentViews, can, effectivePaymentView } from "./permissions";

describe("role permissions", () => {
  it("front desk runs daily operations but cannot configure or see revenue", () => {
    for (const p of ["reservations.manage", "guests.manage", "payments.record", "rooms.status"] as const) {
      expect(can("front_desk", p)).toBe(true);
    }
    for (const p of ["payments.override", "categories.manage", "rooms.configure", "reports.view", "activity.view", "staff.manage", "settings.manage"] as const) {
      expect(can("front_desk", p)).toBe(false);
    }
  });

  it("general manager can override payment requirements and configure, but not manage staff", () => {
    expect(can("general_manager", "payments.override")).toBe(true);
    expect(can("general_manager", "categories.manage")).toBe(true);
    expect(can("general_manager", "staff.manage")).toBe(false);
  });

  it("owner can do everything", () => {
    expect(can("owner", "staff.manage")).toBe(true);
    expect(can("owner", "payments.override")).toBe(true);
  });
});

describe("payments list scope", () => {
  it("front desk gets today's and their own payments; roles that see revenue get everything", () => {
    expect(allowedPaymentViews("front_desk")).toEqual(["today", "mine"]);
    expect(allowedPaymentViews("general_manager")).toEqual(["all"]);
    expect(allowedPaymentViews("owner")).toEqual(["all"]);
    expect(effectivePaymentView("front_desk", "all")).toBe("today");
    expect(effectivePaymentView("front_desk", "mine")).toBe("mine");
    expect(effectivePaymentView("general_manager", "mine")).toBe("all");
  });
});
