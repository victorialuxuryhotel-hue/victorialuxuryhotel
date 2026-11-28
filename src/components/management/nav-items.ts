import {
  Stamp, BarChart3, BedDouble, BookOpen, CalendarCheck, CalendarDays, ClipboardCheck, CreditCard, LayoutDashboard, Package, Presentation, ScrollText, Settings, ShieldCheck, Sun, Tags, TrendingUp, Users, UtensilsCrossed } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; icon: typeof Sun; permission?: readonly Permission[] };
export type NavGroup = { label: string; items: readonly NavItem[] };

export const managementNavGroups: readonly NavGroup[] = [
  {
    label: "Daily work",
    items: [
      { href: "/app/today", label: "Today", icon: Sun, permission: ["reservations.manage"] },
      { href: "/app/reservations", label: "Bookings", icon: CalendarCheck, permission: ["reservations.manage"] },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays, permission: ["reservations.manage"] },
      { href: "/app/rooms", label: "Rooms", icon: BedDouble, permission: ["rooms.status"] },
      { href: "/app/guests", label: "Guests", icon: Users, permission: ["guests.manage"] },
      { href: "/app/payments", label: "Payments", icon: CreditCard, permission: ["payments.record", "reports.view"] },
      { href: "/app/events", label: "Hall bookings", icon: Presentation, permission: ["events.manage"] },
    ],
  },
  {
    label: "Restaurant & bar",
    items: [
      { href: "/app/sales", label: "Till", icon: UtensilsCrossed, permission: ["pos.sell"] },
      { href: "/app/sales/orders", label: "Orders & receipts", icon: ScrollText, permission: ["pos.sell", "pos.view"] },
      { href: "/app/sales/closing", label: "Daily closing", icon: ClipboardCheck, permission: ["pos.sell", "pos.view"] },
      { href: "/app/sales/menu", label: "Menu", icon: BookOpen, permission: ["pos.manage"] },
      { href: "/app/stock", label: "Stock", icon: Package, permission: ["inventory.view", "inventory.manage"] },
      { href: "/app/sales/reports", label: "Sales reports", icon: TrendingUp, permission: ["pos.view"] },
    ],
  },
  {
    label: "Running the hotel",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard, permission: ["reports.view"] },
      { href: "/app/approvals", label: "Approvals", icon: Stamp, permission: ["payments.approve"] },
      { href: "/app/rooms/categories", label: "Rates & room types", icon: Tags, permission: ["categories.manage"] },
      { href: "/app/reports", label: "Reports", icon: BarChart3, permission: ["reports.view", "reports.hotel"] },
      { href: "/app/settings", label: "Booking rules", icon: Settings, permission: ["settings.manage"] },
    ],
  },
  {
    label: "Owner",
    items: [{ href: "/app/staff", label: "Staff & access", icon: ShieldCheck, permission: ["staff.manage"] }],
  },
];

export const managementNav: readonly NavItem[] = managementNavGroups.flatMap((g) => g.items);

export function activeHref(pathname: string, hrefs: readonly string[], base: string): string | undefined {
  return hrefs
    .filter((h) => (h === base ? pathname === base : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
}
