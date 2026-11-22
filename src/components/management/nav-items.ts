import { BedDouble, CalendarCheck, CreditCard, LayoutDashboard, Settings, ShieldCheck, Sun, Tags, Users } from "lucide-react";
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
      { href: "/app/today", label: "Today", icon: Sun },
      { href: "/app/reservations", label: "Reservations", icon: CalendarCheck },
      { href: "/app/rooms", label: "Rooms", icon: BedDouble },
      { href: "/app/guests", label: "Guests", icon: Users },
      { href: "/app/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Running the hotel",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard, permission: ["reports.view"] },
      { href: "/app/rooms/categories", label: "Rates & room types", icon: Tags, permission: ["categories.manage"] },
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
