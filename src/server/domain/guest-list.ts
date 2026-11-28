// The Guests list (R106): search and the two sort orders.

import { all, type Db } from "../db";
import { cleanSearch } from "../db-errors";

export type GuestRecord = { id: string; full_name: string; email: string | null; phone: string | null; notes: string | null; stays: number; last_stay: string | null; total_paid: number };

export const GUEST_COLUMNS = `g.id, g.full_name, g.email, g.phone, g.notes,
  (SELECT count(*) FROM reservations r WHERE r.guest_id = g.id AND r.status IN ('checked_in', 'checked_out')) AS stays,
  (SELECT max(r.check_in) FROM reservations r WHERE r.guest_id = g.id AND r.status IN ('checked_in', 'checked_out')) AS last_stay,
  (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
     FROM payments p JOIN reservations r ON r.id = p.reservation_id
     WHERE r.guest_id = g.id AND p.status = 'successful') AS total_paid`;

export type GuestSort = "recent" | "name";
export const GUEST_SORTS: Array<[GuestSort, string]> = [["recent", "Most recent first"], ["name", "Name A–Z"]];

/** The sort from the address; anything else is the default, most recent first. */
export const guestSort = (v: string | undefined): GuestSort => (v === "name" ? "name" : "recent");

const ORDER: Record<GuestSort, string> = {
  // The last stay's date, or the day the guest was added (Lagos date) for someone who hasn't stayed yet.
  recent: "coalesce(last_stay, date(g.created_at, '+1 hour')) DESC, g.created_at DESC, g.id",
  name: "g.full_name COLLATE NOCASE, g.id",
};

/** One page of guests, plus one more row so the caller can tell whether there's a next page. */
export async function listGuestRecords(db: Db, opts: { q?: string; sort?: GuestSort; page?: number; size?: number } = {}): Promise<GuestRecord[]> {
  const term = cleanSearch(opts.q);
  const size = opts.size ?? 50;
  return all<GuestRecord>(
    db,
    `SELECT ${GUEST_COLUMNS} FROM guests g
     ${term ? "WHERE g.full_name LIKE ?1 OR g.phone LIKE ?1 OR g.email LIKE ?1" : "WHERE ?1 IS NOT NULL"}
     ORDER BY ${ORDER[opts.sort ?? "recent"]} LIMIT ?2 OFFSET ?3`,
    `%${term}%`,
    size + 1,
    ((opts.page ?? 1) - 1) * size,
  );
}
