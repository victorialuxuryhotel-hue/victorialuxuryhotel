import { AppError } from "@/lib/errors";
import { hotelInstant, hotelToday } from "@/lib/hotel-date";
import { ALL_STAFF, all, first, requireRole, writeBatch, type Actor, type Db } from "../db";

/**
 * Housekeeping: the day's cleaning list. Rooms that need cleaning (check-out
 * marks them) come first when a guest arrives today; rooms with a guest staying
 * get a daily tidy. Readiness lives on the room; "tidied" and "cleaned" are read
 * back from the activity log, so nothing new is stored.
 */
export type ToClean = { id: string; number: string; category: string; floor: string | null; readiness: "needs_cleaning" | "cleaning_in_progress"; arrivingToday: boolean };
export type StayOver = { id: string; number: string; category: string; guest: string; tidiedAt: string | null };
export type CleanedToday = { room: string; what: "cleaned" | "tidied"; who: string | null; at: string };

const byNumber = (a: { number: string }, b: { number: string }) => a.number.localeCompare(b.number, undefined, { numeric: true });

export async function cleaningList(db: Db, actor: Actor, today = hotelToday()) {
  requireRole(actor, ALL_STAFF);
  const since = hotelInstant(today, "00:00:00");
  const [dirty, staying, done, unassigned] = await Promise.all([
    all<Omit<ToClean, "arrivingToday"> & { arriving: number }>(
      db,
      `SELECT rm.id, rm.room_number AS number, c.name AS category, rm.floor, rm.readiness,
              EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id AND r.check_in = ?1 AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))) AS arriving
       FROM rooms rm JOIN room_categories c ON c.id = rm.category_id
       WHERE rm.is_active = 1 AND rm.service_status = 'in_service' AND rm.readiness <> 'ready'
         AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id AND r.status = 'checked_in')`,
      today,
    ),
    all<Omit<StayOver, "tidiedAt">>(
      db,
      `SELECT rm.id, rm.room_number AS number, c.name AS category, g.full_name AS guest
       FROM reservations r JOIN rooms rm ON rm.id = r.room_id JOIN room_categories c ON c.id = rm.category_id JOIN guests g ON g.id = r.guest_id
       WHERE r.status = 'checked_in'`,
    ),
    all<{ entity_id: string; room: string; action: string; who: string | null; at: string }>(
      db,
      `SELECT a.entity_id, rm.room_number AS room, a.action, s.full_name AS who, a.created_at AS at
       FROM activity_log a JOIN rooms rm ON rm.id = a.entity_id LEFT JOIN staff_profiles s ON s.id = a.actor_id
       WHERE a.entity_type = 'room' AND a.created_at >= ?
         AND (a.action = 'room.tidied' OR (a.action = 'room.status_updated' AND json_extract(a.metadata, '$.readiness') = 'ready'))
       ORDER BY a.created_at DESC`,
      since,
    ),
    first<{ n: number }>(db, `SELECT count(*) AS n FROM reservations r WHERE r.check_in = ? AND r.room_id IS NULL AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`, today),
  ]);
  const tidied = new Map<string, string>();
  for (const d of done) if (d.action === "room.tidied" && !tidied.has(d.entity_id)) tidied.set(d.entity_id, d.at);
  return {
    toClean: dirty
      .map(({ arriving, ...r }) => ({ ...r, arrivingToday: !!arriving }))
      .sort((a, b) => Number(b.arrivingToday) - Number(a.arrivingToday) || byNumber(a, b)) as ToClean[],
    stayOvers: staying.map((s) => ({ ...s, tidiedAt: tidied.get(s.id) ?? null })).sort(byNumber),
    arrivalsWithoutRoom: unassigned?.n ?? 0,
    doneToday: done.map((d) => ({ room: d.room, what: d.action === "room.tidied" ? "tidied" : "cleaned", who: d.who, at: d.at })) as CleanedToday[],
  };
}

/** Daily tidy of a room with a guest staying. Once per room per day; a second tap is a no-op. */
export async function markTidied(db: Db, actor: Actor, roomId: string, today = hotelToday()): Promise<void> {
  requireRole(actor, ALL_STAFF);
  const room = await first<{ room_number: string }>(db, "SELECT room_number FROM rooms WHERE id = ? AND is_active = 1", roomId);
  if (!room) throw new AppError("NOT_FOUND", "Room not found.");
  const since = hotelInstant(today, "00:00:00");
  const [result] = await writeBatch(db, actor, [
    db
      .prepare(
        `INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
         SELECT (SELECT actor_id FROM _ctx WHERE id = 1), 'staff', 'room.tidied', 'room', ?1, ?2, '{}'
         WHERE EXISTS (SELECT 1 FROM reservations WHERE room_id = ?1 AND status = 'checked_in')
           AND NOT EXISTS (SELECT 1 FROM activity_log WHERE entity_type = 'room' AND entity_id = ?1 AND action = 'room.tidied' AND created_at >= ?3)`,
      )
      .bind(roomId, `Room ${room.room_number}: tidied`, since),
  ]);
  if (result?.meta.changes) return;
  const staying = await first(db, "SELECT 1 FROM reservations WHERE room_id = ? AND status = 'checked_in'", roomId);
  if (!staying) throw new AppError("CONFLICT", "No guest is staying in that room.");
}
