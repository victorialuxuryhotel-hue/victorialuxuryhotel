// The Bookings list (R101): which bookings each tab holds, the status filter, and the tab counts. The
// list query (server/queries/reservations.ts) and the tab counts use these same conditions.

import { reservationStatus, type ReservationStatus } from "@/domain/status";
import { first, type Db } from "../db";

export type ReservationTab = "upcoming" | "in_house" | "awaiting" | "attention" | "past" | "cancelled" | "all";
export type CountedTab = Exclude<ReservationTab, "all">;

/** ?1 is the hotel date today. */
const TAB_WHERE: Record<ReservationTab, string> = {
  upcoming: "r.status IN ('pending_payment', 'confirmed') AND r.check_out >= ?1",
  in_house: "r.status = 'checked_in'",
  awaiting: "r.status = 'pending_payment'",
  attention: "r.attention_reason IS NOT NULL",
  // Ended: checked out or a no-show, both of which happen on or after the arrival day.
  past: "r.status IN ('checked_out', 'no_show') AND r.check_in <= ?1",
  cancelled: "r.status IN ('cancelled', 'expired')",
  all: "1 = 1",
};

/** Newest first for the lists that look back; soonest first for the ones that look ahead. */
export const tabNewestFirst = (tab: ReservationTab) => tab === "all" || tab === "past" || tab === "cancelled";

export function isReservationTab(v: string | undefined): v is ReservationTab {
  return v !== undefined && v in TAB_WHERE;
}

/**
 * The status filter from the address: several statuses, comma-separated ("confirmed,checked_in") or repeated.
 * Anything that isn't a booking status is dropped; the result is in the usual status order, without repeats.
 */
export function bookingStatuses(value: string | string[] | undefined): ReservationStatus[] {
  const asked = new Set((Array.isArray(value) ? value : [value ?? ""]).flatMap((v) => v.split(",")).map((v) => v.trim()));
  return (Object.keys(reservationStatus) as ReservationStatus[]).filter((s) => asked.has(s));
}

/** SQL conditions (on `reservations r`) and their params for a tab and a status filter. */
export function bookingListWhere(tab: ReservationTab, statuses: ReservationStatus[], today: string): { where: string[]; params: unknown[] } {
  const where = [TAB_WHERE[tab].replace("?1", "?")];
  const params: unknown[] = TAB_WHERE[tab].includes("?1") ? [today] : [];
  if (statuses.length) {
    where.push(`r.status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }
  return { where, params };
}

export async function bookingTabCounts(db: Db, today: string): Promise<Record<CountedTab, number>> {
  const tabs = Object.keys(TAB_WHERE).filter((t): t is CountedTab => t !== "all");
  const row = await first<Record<CountedTab, number | null>>(
    db,
    `SELECT ${tabs.map((t) => `sum(${TAB_WHERE[t]}) AS ${t}`).join(", ")} FROM reservations r`,
    today,
  );
  return Object.fromEntries(tabs.map((t) => [t, row?.[t] ?? 0])) as Record<CountedTab, number>;
}
