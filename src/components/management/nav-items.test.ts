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
    expect(visible("front_desk")).toEqual([{ label: "Daily work", items: ["Today", "Bookings", "Calendar", "Rooms", "Guests", "Payments", "Hall bookings"] }]);
  });
  it("the general manager runs the hotel and can view the restaurant & bar, but not sell or change it", () => {
    const groups = visible("general_manager");
    expect(groups.map((g) => g.label)).toEqual(["Daily work", "Restaurant & bar", "Running the hotel"]);
    expect(groups[1]!.items).toEqual(["Orders & receipts", "Daily closing", "Stock", "Sales reports"]);
    expect(groups[2]!.items).toEqual(["Dashboard", "Rates & room types", "Reports", "Booking rules"]);
  });
  it("the calendar is for the front desk, hotel manager, GM and owner (I6)", () => {
    const has = (r: StaffRole) => visible(r).some((g) => g.items.includes("Calendar"));
    expect((["front_desk", "hotel_manager", "general_manager", "owner"] as const).every(has)).toBe(true);
    expect((["finance", "restaurant_bar", "restaurant_bar_manager"] as const).some(has)).toBe(false);
  });
  it("finance sees money only, including the restaurant & bar's", () => {
    expect(visible("finance")).toEqual([
      { label: "Daily work", items: ["Payments"] },
      { label: "Restaurant & bar", items: ["Orders & receipts", "Daily closing", "Stock", "Sales reports"] },
      { label: "Running the hotel", items: ["Dashboard", "Reports"] },
    ]);
  });
  it("restaurant & bar attendants see the till, their orders and closing; their manager runs the whole department", () => {
    expect(visible("restaurant_bar")).toEqual([{ label: "Restaurant & bar", items: ["Till", "Orders & receipts", "Daily closing"] }]);
    expect(visible("restaurant_bar_manager")).toEqual([
      { label: "Restaurant & bar", items: ["Till", "Orders & receipts", "Daily closing", "Menu", "Stock", "Sales reports"] },
    ]);
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
