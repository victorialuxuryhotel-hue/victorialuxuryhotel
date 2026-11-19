import { BedDouble, CalendarCheck, ConciergeBell, CreditCard, LayoutDashboard, Settings, Users } from "lucide-react";

/** Management navigation. A plain module so both server and client code can import it. */
export const managementNav = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/front-desk", label: "Front desk", icon: ConciergeBell },
  { href: "/app/reservations", label: "Reservations", icon: CalendarCheck },
  { href: "/app/rooms", label: "Rooms", icon: BedDouble },
  { href: "/app/guests", label: "Guests", icon: Users },
  { href: "/app/payments", label: "Payments", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;
