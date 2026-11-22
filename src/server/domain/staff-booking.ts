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

export type FreeRoom = { id: string; number: string; floor: string | null };
export type TypeAvailability = { categoryId: string; free: number; rooms: FreeRoom[] };

/**
 * Free rooms per active room type for the stay (staff only; the public search
 * never shows counts). `free` is the type's capacity; `rooms` are the specific
 * rooms free every night, ready ones first, for staff to pick from.
 */
export async function availabilityForStay(db: Db, actor: Actor, checkIn: string, checkOut: string): Promise<TypeAvailability[]> {
  requireRole(actor, ALL_STAFF);
  validateStay(checkIn, checkOut, 1);
  const [cats, rooms] = await Promise.all([
    all<{ id: string }>(db, "SELECT id FROM room_categories WHERE is_active = 1"),
    all<FreeRoom & { category_id: string }>(
      db,
      `SELECT rm.id, rm.room_number AS number, rm.floor, rm.category_id FROM rooms rm
       WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
         AND NOT EXISTS (
           SELECT 1 FROM reservations o WHERE o.room_id = rm.id
             AND o.status IN ('pending_payment', 'confirmed', 'checked_in')
             AND o.check_in < ?2 AND ?1 < o.check_out)
       ORDER BY rm.readiness = 'ready' DESC, length(rm.room_number), rm.room_number`,
      checkIn,
      checkOut,
    ),
  ]);
  return Promise.all(
    cats.map(async (c) => {
      const free = Math.max(0, await freeUnits(db, c.id, checkIn, checkOut));
      // Rooms can look free while the type is full (unassigned bookings hold them).
      return { categoryId: c.id, free, rooms: free ? rooms.filter((r) => r.category_id === c.id).map(({ id, number, floor }) => ({ id, number, floor })) : [] };
    }),
  );
}
