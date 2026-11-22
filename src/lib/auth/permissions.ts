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
  | "settings.manage" // booking rules
  | "reports.view" // revenue summaries
  | "activity.view"
  | "staff.manage";

const frontDesk: Permission[] = ["reservations.manage", "guests.manage", "payments.record", "rooms.status"];
const manager: Permission[] = [
  ...frontDesk,
  "payments.override",
  "rooms.configure",
  "categories.manage",
  "settings.manage",
  "reports.view",
  "activity.view",
];

const matrix: Record<StaffRole, ReadonlySet<Permission>> = {
  front_desk: new Set(frontDesk),
  general_manager: new Set(manager),
  owner: new Set<Permission>([...manager, "staff.manage"]),
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
