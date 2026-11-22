import { phoneMatches, localDigits } from "@/lib/phone";
import { ALL_STAFF, all, requireRole, type Actor, type Db } from "../db";
import { freeUnits, validateStay } from "./inventory";

/**
 * Helpers for the staff New reservation form (6d): find a returning guest by
 * phone as it's typed, and show which room types are free for the dates.
 */
export type PhoneMatch = { id: string; name: string; phone: string | null; email: string | null; stays: number };

export async function findGuestsByPhone(db: Db, actor: Actor, typed: string): Promise<PhoneMatch[]> {
  requireRole(actor, ALL_STAFF);
  if (localDigits(typed).length < 7) return [];
  const digits = localDigits(typed).replace(/^0/, "");
  const tail = digits.slice(-7);
  const rows = await all<PhoneMatch>(
    db,
    `SELECT g.id, g.full_name AS name, g.phone, g.email,
            (SELECT count(*) FROM reservations r WHERE r.guest_id = g.id AND r.status IN ('confirmed', 'checked_in', 'checked_out')) AS stays
     FROM guests g
     WHERE replace(replace(replace(replace(replace(coalesce(g.phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
     ORDER BY stays DESC, g.created_at DESC LIMIT 20`,
    `%${tail}%`,
  );
  return rows.filter((r) => phoneMatches(r.phone, typed)).slice(0, 3);
}

export type TypeAvailability = { categoryId: string; free: number };

/** Free rooms per active room type for the stay (staff only; the public search never shows counts). */
export async function availabilityForStay(db: Db, actor: Actor, checkIn: string, checkOut: string): Promise<TypeAvailability[]> {
  requireRole(actor, ALL_STAFF);
  validateStay(checkIn, checkOut, 1);
  const cats = await all<{ id: string }>(db, "SELECT id FROM room_categories WHERE is_active = 1");
  return Promise.all(cats.map(async (c) => ({ categoryId: c.id, free: Math.max(0, await freeUnits(db, c.id, checkIn, checkOut)) })));
}
