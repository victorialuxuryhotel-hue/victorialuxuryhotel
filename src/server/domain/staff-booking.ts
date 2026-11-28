import { phoneMatches, localDigits } from "@/lib/phone";
import { ALL_STAFF, all, requireRole, type Actor, type Db } from "../db";
import { freeUnits, stayEndSql, validateStay } from "./inventory";

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

export type FreeRoom = { id: string; number: string; floor: string | null; ready?: boolean };
export type TypeAvailability = { categoryId: string; free: number; rooms: FreeRoom[] };

export async function availabilityForStay(db: Db, actor: Actor, checkIn: string, checkOut: string): Promise<TypeAvailability[]> {
  requireRole(actor, ALL_STAFF);
  validateStay(checkIn, checkOut, 1);
  const [cats, rooms] = await Promise.all([
    all<{ id: string }>(db, "SELECT id FROM room_categories WHERE is_active = 1"),
    all<FreeRoom & { category_id: string; readiness: string }>(
      db,
      `SELECT rm.id, rm.room_number AS number, rm.floor, rm.category_id, rm.readiness FROM rooms rm
       -- An overstaying guest holds their room until checked out, as in the count (freeUnits).
       WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
         AND NOT EXISTS (
           SELECT 1 FROM reservations o WHERE o.room_id = rm.id
             AND o.status IN ('pending_payment', 'confirmed', 'checked_in')
             AND o.check_in < ?2 AND ?1 < ${stayEndSql("o")})
       ORDER BY rm.readiness = 'ready' DESC, length(rm.room_number), rm.room_number`,
      checkIn,
      checkOut,
    ),
  ]);
  return Promise.all(
    cats.map(async (c) => {
      const free = Math.max(0, await freeUnits(db, c.id, checkIn, checkOut));
      return { categoryId: c.id, free, rooms: free ? rooms.filter((r) => r.category_id === c.id).map(({ id, number, floor, readiness }) => ({ id, number, floor, ready: readiness === "ready" })) : [] };
    }),
  );
}
