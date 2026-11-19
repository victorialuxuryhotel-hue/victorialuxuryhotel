import type { StaffRole } from "@/domain/status";

/**
 * What each role may do. Deliberately small: three roles, a flat list of
 * capabilities. The database enforces the same rules through RLS and the
 * business functions (see supabase/migrations/*access_control*); this matrix
 * decides what the app offers and gives a clear error before the database
 * would refuse.
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
