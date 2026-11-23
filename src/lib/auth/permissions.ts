import type { StaffRole } from "@/domain/status";

export type Permission =
  | "reservations.manage" // create, edit, assign rooms, check in/out, cancel
  | "guests.manage"
  | "payments.record" // offline payments, after confirming receipt
  | "payments.override" // confirm without full payment / extend a hold
  | "rooms.status" // readiness and maintenance
  | "rooms.configure" // add rooms, change category
  | "categories.manage" // names, rates, photos, visibility
  | "settings.manage" // booking rules, extras, promo codes, VAT
  | "reports.view" // revenue summaries
  | "activity.view"
  | "staff.manage"
  | "expenses.manage" // record and void expenses
  | "pos.sell" // restaurant and bar sales
  | "pos.settle" // take payment for room charges (front desk, at check-out)
  | "pos.manage" // menu, voids
  | "inventory.use" // record stock used
  | "inventory.manage" // stock items, deliveries, adjustments
  | "events.manage"; // conference hall bookings and payments

const frontDesk: Permission[] = ["reservations.manage", "guests.manage", "payments.record", "rooms.status", "pos.settle", "events.manage"];
const manager: Permission[] = [
  ...frontDesk,
  "payments.override",
  "rooms.configure",
  "categories.manage",
  "settings.manage",
  "reports.view",
  "activity.view",
  "expenses.manage",
  "pos.sell",
  "pos.manage",
  "inventory.use",
  "inventory.manage",
];

const matrix: Record<StaffRole, ReadonlySet<Permission>> = {
  front_desk: new Set(frontDesk),
  general_manager: new Set(manager),
  owner: new Set<Permission>([...manager, "staff.manage"]),
  finance: new Set<Permission>(["reports.view", "expenses.manage"]),
  restaurant_bar: new Set<Permission>(["pos.sell", "inventory.use"]),
};

export function can(role: StaffRole, permission: Permission): boolean {
  return matrix[role].has(permission);
}

export type PaymentView = "all" | "today" | "mine";

export function allowedPaymentViews(role: StaffRole): readonly PaymentView[] {
  return can(role, "reports.view") ? ["all"] : ["today", "mine"];
}

export function effectivePaymentView(role: StaffRole, requested: string | undefined): PaymentView {
  const allowed = allowedPaymentViews(role);
  return allowed.includes(requested as PaymentView) ? (requested as PaymentView) : allowed[0]!;
}

export function canAny(role: StaffRole, permission: Permission | readonly Permission[]): boolean {
  return (typeof permission === "string" ? [permission] : permission).some((p) => can(role, p));
}
