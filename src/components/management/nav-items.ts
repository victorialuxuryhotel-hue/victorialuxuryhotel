import { BarChart3, BedDouble, CalendarCheck, CreditCard, LayoutDashboard, Package, Presentation, Receipt, Settings, ShieldCheck, Sun, Tags, Users, UtensilsCrossed } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Management navigation, grouped by what the work is. An item with
 * `permission` is shown when the role has ANY of those permissions (decided
 * on the server). Pages re-check on their own; hiding a link is not the gate.
 * A plain module so both server and client code can import it.
 */
export type NavItem = { href: string; label: string; icon: typeof Sun; permission?: readonly Permission[] };
export type NavGroup = { label: string; items: readonly NavItem[] };

export const managementNavGroups: readonly NavGroup[] = [
  {
    label: "Daily work",
    items: [
      { href: "/app/today", label: "Today", icon: Sun, permission: ["reservations.manage"] },
      { href: "/app/reservations", label: "Reservations", icon: CalendarCheck, permission: ["reservations.manage"] },
      { href: "/app/rooms", label: "Rooms", icon: BedDouble, permission: ["rooms.status"] },
      { href: "/app/guests", label: "Guests", icon: Users, permission: ["guests.manage"] },
      { href: "/app/payments", label: "Payments", icon: CreditCard, permission: ["payments.record", "reports.view"] },
      { href: "/app/sales", label: "Restaurant & bar", icon: UtensilsCrossed, permission: ["pos.sell"] },
      { href: "/app/events", label: "Hall bookings", icon: Presentation, permission: ["events.manage"] },
      { href: "/app/stock", label: "Stock", icon: Package, permission: ["inventory.use"] },
    ],
  },
  {
    label: "Running the hotel",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard, permission: ["reports.view"] },
      { href: "/app/rooms/categories", label: "Rates & room types", icon: Tags, permission: ["categories.manage"] },
      { href: "/app/reports", label: "Reports", icon: BarChart3, permission: ["reports.view"] },
      { href: "/app/expenses", label: "Expenses", icon: Receipt, permission: ["expenses.manage"] },
      { href: "/app/settings", label: "Booking rules", icon: Settings, permission: ["settings.manage"] },
    ],
  },
  {
    label: "Owner",
    items: [{ href: "/app/staff", label: "Staff & access", icon: ShieldCheck, permission: ["staff.manage"] }],
  },
];

export const managementNav: readonly NavItem[] = managementNavGroups.flatMap((g) => g.items);

/** The one menu item for this page: the longest href that matches (so Rates & room types beats Rooms). */
export function activeHref(pathname: string, hrefs: readonly string[], base: string): string | undefined {
  return hrefs
    .filter((h) => (h === base ? pathname === base : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
}
