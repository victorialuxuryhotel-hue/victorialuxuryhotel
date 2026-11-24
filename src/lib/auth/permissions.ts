import type { StaffRole } from "@/domain/status";

export type Permission =
  | "reservations.manage"
  | "guests.manage"
  | "payments.record"
  | "payments.override"
  | "payments.approve"
  | "rooms.status"
  | "rooms.configure"
  | "categories.manage"
  | "settings.manage"
  | "reports.view"
  | "reports.hotel"
  | "activity.view"
  | "staff.manage"
  | "pos.sell"
  | "pos.view"
  | "pos.manage"
  | "inventory.view"
  | "inventory.manage"
  | "events.manage";

const frontDesk: Permission[] = ["reservations.manage", "guests.manage", "payments.record", "rooms.status", "events.manage"];
const manager: Permission[] = [
  ...frontDesk,
  "payments.override",
  "payments.approve",
  "rooms.configure",
  "categories.manage",
  "settings.manage",
  "reports.view",
  "activity.view",
  "pos.view",
  "inventory.view",
];

const hotelManager: Permission[] = [
  ...frontDesk,
  "payments.override",
  "rooms.configure",
  "categories.manage",
  "settings.manage",
  "reports.hotel",
  "activity.view",
];

const matrix: Record<StaffRole, ReadonlySet<Permission>> = {
  hotel_manager: new Set(hotelManager),
  front_desk: new Set(frontDesk),
  general_manager: new Set(manager),
  owner: new Set<Permission>([...manager, "staff.manage", "pos.sell", "pos.manage", "inventory.manage"]),
  finance: new Set<Permission>(["reports.view", "pos.view", "inventory.view"]),
  restaurant_bar: new Set<Permission>(["pos.sell"]),
  restaurant_bar_manager: new Set<Permission>(["pos.sell", "pos.view", "pos.manage", "inventory.view", "inventory.manage"]),
};

export function can(role: StaffRole, permission: Permission): boolean {
  return matrix[role]?.has(permission) ?? false;
}

export type PaymentView = "all" | "today" | "mine";

export function allowedPaymentViews(role: StaffRole): readonly PaymentView[] {
  return can(role, "reports.view") || can(role, "reports.hotel") ? ["all"] : ["today", "mine"];
}

export function effectivePaymentView(role: StaffRole, requested: string | undefined): PaymentView {
  const allowed = allowedPaymentViews(role);
  return allowed.includes(requested as PaymentView) ? (requested as PaymentView) : allowed[0]!;
}

export function canAny(role: StaffRole, permission: Permission | readonly Permission[]): boolean {
  return (typeof permission === "string" ? [permission] : permission).some((p) => can(role, p));
}
