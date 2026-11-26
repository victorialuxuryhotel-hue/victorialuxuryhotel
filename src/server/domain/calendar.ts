// Room calendar data (interface brief I6): four queries for the whole window, none per room or per
// day. Free counts use the shared definition (inventory.ts freeOnNightSql), so the header row agrees
// with Today, the booking form and the website (tests/db/availability.test.ts).

import type { CalRoom, CalStay, CalType } from "@/domain/calendar";
import { addDays } from "@/lib/hotel-date";
import { all, requireRole, type Actor, type Db } from "../db";
import { freeOnNightSql, LIVE_SQL, stayEndSql } from "./inventory";

const CALENDAR_ROLES = ["owner", "general_manager", "hotel_manager", "front_desk"] as const;

export async function calendarData(db: Db, actor: Actor, from: string, days: number) {
  requireRole(actor, CALENDAR_ROLES);
  const to = addDays(from, days);
  const [types, rooms, stays, free] = await Promise.all([
    all<CalType>(db, "SELECT id, name FROM room_categories WHERE is_active = 1 ORDER BY sort_order, nightly_rate_kobo"),
    all<{ id: string; number: string; category_id: string; service_status: string; maintenance_note: string | null }>(
      db,
      `SELECT id, room_number AS number, category_id, service_status, maintenance_note FROM rooms
       WHERE is_active = 1 ORDER BY length(room_number), room_number`,
    ),
    all<{ id: string; reference: string; guest_name: string; room_id: string | null; category_id: string; check_in: string; check_out: string; stay_end: string; status: CalStay["status"] }>(
      db,
      `SELECT r.id, r.reference, g.full_name AS guest_name, r.room_id, coalesce(rm.category_id, r.category_id) AS category_id,
              r.check_in, r.check_out, ${stayEndSql("r")} AS stay_end, r.status
       FROM reservations r JOIN guests g ON g.id = r.guest_id LEFT JOIN rooms rm ON rm.id = r.room_id
       WHERE ${LIVE_SQL} AND r.check_in < ?2 AND ${stayEndSql("r")} > ?1
       ORDER BY r.check_in`,
      from,
      to,
    ),
    all<{ category_id: string; d: string; free: number }>(
      db,
      `SELECT c.id AS category_id, cal.d, ${freeOnNightSql("c.id", "cal.d")} AS free
       FROM room_categories c JOIN calendar cal ON cal.d >= ?1 AND cal.d < ?2
       WHERE c.is_active = 1`,
      from,
      to,
    ),
  ]);
  const freeMap = new Map<string, Map<string, number>>();
  for (const f of free) {
    if (!freeMap.has(f.category_id)) freeMap.set(f.category_id, new Map());
    freeMap.get(f.category_id)!.set(f.d, f.free);
  }
  return {
    types,
    rooms: rooms.map((r): CalRoom => ({ id: r.id, number: r.number, categoryId: r.category_id, outOfOrder: r.service_status !== "in_service", note: r.maintenance_note })),
    stays: stays.map((s): CalStay => ({
      id: s.id, reference: s.reference, guestName: s.guest_name, roomId: s.room_id, categoryId: s.category_id,
      checkIn: s.check_in, checkOut: s.check_out, end: s.stay_end, status: s.status,
    })),
    free: freeMap,
  };
}
