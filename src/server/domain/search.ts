// Global search (interface brief I9): guests, bookings and rooms, at most 5 of each, only the groups
// the role can open. Three small indexed-ish queries with LIMITs; the box debounces typing.

import { localDigits } from "@/lib/phone";
import { all, type Db } from "../db";
import { cleanSearch } from "../db-errors";

export type SearchScopes = { guests: boolean; bookings: boolean; rooms: boolean };
export type SearchResults = {
  guests: { id: string; name: string; phone: string | null; email: string | null }[];
  bookings: { id: string; reference: string; guestName: string; checkIn: string; checkOut: string; status: string }[];
  rooms: { id: string; number: string; category: string }[];
};

export const SEARCH_LIMIT = 5;

export async function globalSearch(db: Db, scopes: SearchScopes, typed: string): Promise<SearchResults> {
  const q = cleanSearch(typed);
  const empty: SearchResults = { guests: [], bookings: [], rooms: [] };
  if (q.length < 2) return empty;
  const like = `%${q}%`;
  const digits = localDigits(q).replace(/^0/, "");
  const phone = digits.length >= 4 ? `%${digits}%` : null;
  const phoneSql = "replace(replace(replace(replace(coalesce(g.phone, ''), ' ', ''), '-', ''), '+', ''), '(', '')";
  const [guests, bookings, rooms] = await Promise.all([
    scopes.guests
      ? all<SearchResults["guests"][number]>(
          db,
          `SELECT g.id, g.full_name AS name, g.phone, g.email FROM guests g
           WHERE g.full_name LIKE ?1 OR g.email LIKE ?1 OR (?2 IS NOT NULL AND ${phoneSql} LIKE ?2)
           ORDER BY g.full_name LIKE ?3 DESC, g.created_at DESC LIMIT ${SEARCH_LIMIT}`,
          like,
          phone,
          `${q}%`,
        )
      : Promise.resolve([]),
    scopes.bookings
      ? all<SearchResults["bookings"][number]>(
          db,
          `SELECT r.id, r.reference, g.full_name AS guestName, r.check_in AS checkIn, r.check_out AS checkOut, r.status
           FROM reservations r JOIN guests g ON g.id = r.guest_id
           WHERE r.reference LIKE ?1 OR g.full_name LIKE ?2 OR (?3 IS NOT NULL AND ${phoneSql} LIKE ?3)
           ORDER BY r.reference LIKE ?1 DESC, abs(julianday(r.check_in) - julianday('now')) LIMIT ${SEARCH_LIMIT}`,
          `${q.toUpperCase().startsWith("VL-") ? q : `VL-${q}`}%`,
          like,
          phone,
        )
      : Promise.resolve([]),
    scopes.rooms
      ? all<SearchResults["rooms"][number]>(
          db,
          `SELECT rm.id, rm.room_number AS number, c.name AS category FROM rooms rm JOIN room_categories c ON c.id = rm.category_id
           WHERE rm.is_active = 1 AND rm.room_number LIKE ?1 ORDER BY length(rm.room_number), rm.room_number LIMIT ${SEARCH_LIMIT}`,
          `${q.replace(/^room\s*/i, "")}%`,
        )
      : Promise.resolve([]),
  ]);
  return { guests, bookings, rooms };
}
