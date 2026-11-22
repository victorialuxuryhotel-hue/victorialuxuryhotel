import type { StaffRole } from "@/domain/status";

/**
 * What each role may do. Deliberately small: three roles, a flat list of
 * capabilities. The data layer enforces the same rules again in every
 * business function (requireRole in src/server/domain/*); this matrix decides
 * what the app offers and gives a clear error first.
 *
 * Future departments (finance, restaurant, housekeeping) add roles to the
 * staff_role enum and rows here; nothing else needs to change.
 */
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
  // Money only: reports, payments and expenses. No bookings or rooms.
  finance: new Set<Permission>(["reports.view", "expenses.manage"]),
  // The till, and recording stock they use.
  restaurant_bar: new Set<Permission>(["pos.sell", "inventory.use"]),
};

export function can(role: StaffRole, permission: Permission): boolean {
  return matrix[role].has(permission);
}

/**
 * Payments list. Roles that see revenue see every payment ("all"). Front desk
 * sees today's payments (Lagos time) or the ones they recorded ("mine"),
 * enforced in the query (src/server/domain/payment-list.ts).
 */
export type PaymentView = "all" | "today" | "mine";

export function allowedPaymentViews(role: StaffRole): readonly PaymentView[] {
  return can(role, "reports.view") ? ["all"] : ["today", "mine"];
}

/** The view actually used: anything the role may not use falls back to its first allowed view. */
export function effectivePaymentView(role: StaffRole, requested: string | undefined): PaymentView {
  const allowed = allowedPaymentViews(role);
  return allowed.includes(requested as PaymentView) ? (requested as PaymentView) : allowed[0]!;
}
