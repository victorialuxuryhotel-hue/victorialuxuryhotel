import "server-only";
import type { RoomBoardState } from "@/domain/status";
import type { CategoryRow, RoomTile } from "@/domain/views";
import { hotelToday } from "@/lib/hotel-date";
import { mediaUrl } from "@/lib/media";
import { authorize } from "../auth";
import { all, first, getDb } from "../db";

export type BoardRoom = RoomTile & { categoryId: string; serviceStatus: "in_service" | "maintenance"; reservationId?: string };

/**
 * Every room with its state right now. Occupancy is derived from reservations;
 * only maintenance and readiness are stored on the room itself.
 */
export async function roomBoard(): Promise<BoardRoom[]> {
  await authorize();
  const db = await getDb();
  const today = hotelToday();
  const [rooms, stays] = await Promise.all([
    all<{ id: string; room_number: string; floor: string | null; readiness: RoomTile["readiness"]; service_status: "in_service" | "maintenance"; maintenance_note: string | null; category_id: string; category_name: string }>(
      db,
      `SELECT rm.id, rm.room_number, rm.floor, rm.readiness, rm.service_status, rm.maintenance_note, rm.category_id, c.name AS category_name
       FROM rooms rm JOIN room_categories c ON c.id = rm.category_id WHERE rm.is_active = 1`,
    ),
    all<{ id: string; room_id: string; status: string; check_in: string; check_out: string; guest_name: string }>(
      db,
      `SELECT r.id, r.room_id, r.status, r.check_in, r.check_out, g.full_name AS guest_name
       FROM reservations r JOIN guests g ON g.id = r.guest_id
       WHERE r.room_id IS NOT NULL AND r.status IN ('checked_in', 'confirmed', 'pending_payment') AND r.check_in <= ?1 AND r.check_out >= ?1`,
      today,
    ),
  ]);

  const byRoom = new Map<string, typeof stays>();
  for (const s of stays) byRoom.set(s.room_id, [...(byRoom.get(s.room_id) ?? []), s]);

  return rooms
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    .map((room) => {
      const roomStays = byRoom.get(room.id) ?? [];
      const inHouse = roomStays.find((s) => s.status === "checked_in");
      const arriving = roomStays.find((s) => s.status !== "checked_in" && s.check_in === today);
      let state: RoomBoardState = "available";
      if (room.service_status === "maintenance") state = "maintenance";
      else if (inHouse) state = "occupied";
      else if (arriving) state = "arriving";
      else if (room.readiness !== "ready") state = "dirty";
      const stay = inHouse ?? arriving;
      return {
        id: room.id,
        number: room.room_number,
        category: room.category_name,
        categoryId: room.category_id,
        floor: room.floor ?? undefined,
        state,
        readiness: room.readiness,
        serviceStatus: room.service_status,
        guestName: stay?.guest_name,
        until: inHouse?.check_out,
        note: room.maintenance_note ?? undefined,
        reservationId: stay?.id,
      };
    });
}

/** In-service rooms of any category that are free for the given nights. */
export async function assignableRooms(reservationId: string, checkIn: string, checkOut: string) {
  await authorize();
  const rows = await all<{ id: string; room_number: string; readiness: string; category_name: string }>(
    await getDb(),
    `SELECT rm.id, rm.room_number, rm.readiness, c.name AS category_name
     FROM rooms rm JOIN room_categories c ON c.id = rm.category_id
     WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
       AND NOT EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.room_id = rm.id AND r.id <> ?1 AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
           AND r.check_in < ?3 AND r.check_out > ?2)`,
    reservationId,
    checkIn,
    checkOut,
  );
  return rows
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    .map((r) => ({ id: r.id, number: r.room_number, category: r.category_name, ready: r.readiness === "ready" }));
}

export async function listCategories(): Promise<CategoryRow[]> {
  await authorize();
  const rows = await all<{ id: string; name: string; slug: string; nightly_rate_kobo: number; max_occupancy: number; is_active: number; rooms: number; images: number }>(
    await getDb(),
    `SELECT c.id, c.name, c.slug, c.nightly_rate_kobo, c.max_occupancy, c.is_active,
            (SELECT count(*) FROM rooms WHERE category_id = c.id) AS rooms,
            (SELECT count(*) FROM room_category_images WHERE category_id = c.id) AS images
     FROM room_categories c ORDER BY c.sort_order, c.name`,
  );
  return rows.map((c) => ({
    id: c.id, name: c.name, slug: c.slug, nightlyRateKobo: c.nightly_rate_kobo, maxOccupancy: c.max_occupancy,
    rooms: c.rooms, images: c.images, isActive: c.is_active === 1,
  }));
}

export type CategoryDetail = CategoryRow & {
  shortDescription: string; description: string; amenities: string[]; sortOrder: number;
  photos: Array<{ id: string; url: string; alt: string; isCover: boolean }>;
};

export async function getCategory(id: string): Promise<CategoryDetail | null> {
  await authorize();
  const db = await getDb();
  const c = await first<{
    id: string; name: string; slug: string; nightly_rate_kobo: number; max_occupancy: number; is_active: number; short_description: string | null;
    description: string | null; amenities: string; sort_order: number; rooms: number;
  }>(
    db,
    `SELECT c.*, (SELECT count(*) FROM rooms WHERE category_id = c.id) AS rooms FROM room_categories c WHERE c.id = ?`,
    id,
  );
  if (!c) return null;
  const photos = await all<{ id: string; storage_path: string; alt_text: string; is_cover: number }>(
    db,
    "SELECT id, storage_path, alt_text, is_cover FROM room_category_images WHERE category_id = ? ORDER BY sort_order, created_at",
    id,
  );
  return {
    id: c.id, name: c.name, slug: c.slug, nightlyRateKobo: c.nightly_rate_kobo, maxOccupancy: c.max_occupancy, isActive: c.is_active === 1,
    rooms: c.rooms, images: photos.length,
    shortDescription: c.short_description ?? "", description: c.description ?? "", amenities: JSON.parse(c.amenities) as string[], sortOrder: c.sort_order,
    photos: photos.map((p) => ({ id: p.id, url: mediaUrl(p.storage_path), alt: p.alt_text, isCover: p.is_cover === 1 })),
  };
}
