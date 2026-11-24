import { describe, expect, it } from "vitest";
import { allowedPaymentViews, can, effectivePaymentView, type Permission } from "./permissions";
import type { StaffRole } from "@/domain/status";

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

const ALL: Permission[] = [
  "reservations.manage", "guests.manage", "payments.record", "payments.override", "payments.approve", "rooms.status", "rooms.configure",
  "categories.manage", "settings.manage", "reports.view", "reports.hotel", "activity.view", "staff.manage", "pos.sell", "pos.view",
  "pos.manage", "inventory.view", "inventory.manage", "events.manage",
];
const desk: Permission[] = ["reservations.manage", "guests.manage", "payments.record", "rooms.status", "events.manage"];
const gmSet: Permission[] = [...desk, "payments.override", "payments.approve", "rooms.configure", "categories.manage", "settings.manage", "reports.view", "activity.view", "pos.view", "inventory.view"];
const expected: Record<StaffRole, Permission[]> = {
  owner: [...gmSet, "staff.manage", "pos.sell", "pos.manage", "inventory.manage"],
  general_manager: gmSet,
  hotel_manager: [...desk, "payments.override", "rooms.configure", "categories.manage", "settings.manage", "reports.hotel", "activity.view"],
  front_desk: desk,
  finance: ["reports.view", "pos.view", "inventory.view"],
  restaurant_bar: ["pos.sell"],
  restaurant_bar_manager: ["pos.sell", "pos.view", "pos.manage", "inventory.view", "inventory.manage"],
};

describe("permission matrix for all seven roles", () => {
  for (const [role, allowed] of Object.entries(expected) as Array<[StaffRole, Permission[]]>) {
    it(role, () => {
      expect(ALL.filter((p) => can(role, p))).toEqual(ALL.filter((p) => allowed.includes(p)));
    });
  }

  it("only the owner manages staff; only the owner and general manager approve corrections and refunds", () => {
    expect((Object.keys(expected) as StaffRole[]).filter((r) => can(r, "staff.manage"))).toEqual(["owner"]);
    expect((Object.keys(expected) as StaffRole[]).filter((r) => can(r, "payments.approve"))).toEqual(["owner", "general_manager"]);
  });

  it("finance has no permission that changes anything", () => {
    expect(ALL.filter((p) => can("finance", p) && !p.endsWith(".view"))).toEqual([]);
  });
});
