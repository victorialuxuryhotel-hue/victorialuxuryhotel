import { describe, expect, it } from "vitest";
import { can, type Permission } from "@/lib/auth/permissions";
import type { StaffRole } from "@/domain/status";
import { activeHref, managementNavGroups } from "./nav-items";

const visible = (role: StaffRole) =>
  managementNavGroups
    .map((g) => ({ label: g.label, items: g.items.filter((i) => !i.permission || i.permission.some((p: Permission) => can(role, p))).map((i) => i.label) }))
    .filter((g) => g.items.length);

describe("menu by role", () => {
  it("front desk sees only daily work, never the dashboard", () => {
    expect(visible("front_desk")).toEqual([{ label: "Daily work", items: ["Today", "Reservations", "Rooms", "Guests", "Payments", "Hall bookings"] }]);
  });
  it("the general manager also runs the hotel, but has no staff section", () => {
    const groups = visible("general_manager");
    expect(groups.map((g) => g.label)).toEqual(["Daily work", "Running the hotel"]);
    expect(groups[1]!.items).toEqual(["Dashboard", "Rates & room types", "Reports", "Expenses", "Booking rules"]);
  });
  it("finance sees money only; restaurant & bar sees the till and stock", () => {
    expect(visible("finance")).toEqual([
      { label: "Daily work", items: ["Payments"] },
      { label: "Running the hotel", items: ["Dashboard", "Reports", "Expenses"] },
    ]);
    expect(visible("restaurant_bar")).toEqual([{ label: "Daily work", items: ["Restaurant & bar", "Stock"] }]);
  });
  it("the owner also manages staff", () => {
    expect(visible("owner").at(-1)).toEqual({ label: "Owner", items: ["Staff & access"] });
  });
});

describe("activeHref", () => {
  const hrefs = ["/app", "/app/rooms", "/app/rooms/categories", "/app/reservations"];
  it("picks the most specific match", () => {
    expect(activeHref("/app/rooms/categories/abc", hrefs, "/app")).toBe("/app/rooms/categories");
    expect(activeHref("/app/rooms", hrefs, "/app")).toBe("/app/rooms");
    expect(activeHref("/app/reservations/x", hrefs, "/app")).toBe("/app/reservations");
  });
  it("matches the dashboard only on its own page, and nothing on unknown pages", () => {
    expect(activeHref("/app", hrefs, "/app")).toBe("/app");
    expect(activeHref("/app/account", hrefs, "/app")).toBeUndefined();
    expect(activeHref("/app/roomsx", hrefs, "/app")).toBeUndefined();
  });
});
