import "server-only";
import { boardState } from "@/domain/room-board";
import type { TonightType } from "@/domain/today";
import type { CategoryRow, RoomTile } from "@/domain/views";
import { hotelToday, isIsoDate, tonight } from "@/lib/hotel-date";
import { mediaUrl } from "@/lib/media";
import { actorOf, authorizeRead } from "../auth";
import { all, first, getDb } from "../db";
import { calendarData } from "../domain/calendar";
import { availableOnNight, roomChoices, roomStays } from "../domain/inventory";

export type BoardRoom = RoomTile & { categoryId: string; serviceStatus: "in_service" | "maintenance"; reservationId?: string };

/** Room types free tonight (business date), counted exactly as the website and the booking form count. */
export async function availableTonight(): Promise<TonightType[]> {
  await authorizeRead("reservations.manage");
  const rows = await availableOnNight(await getDb(), tonight());
  return rows.map((r) => ({ categoryId: r.category_id, name: r.name, rateKobo: r.nightly_rate_kobo, rooms: r.rooms, free: r.free, held: r.held }));
}

/** The room calendar (I6): 14 nights from `from` (default: tonight's business date). */
export async function roomCalendar(from?: string) {
  const staff = await authorizeRead("reservations.manage");
  const start = from && isIsoDate(from) && from >= "2024-01-01" && from <= "2045-12-01" ? from : tonight();
  const data = await calendarData(await getDb(), actorOf(staff), start, CALENDAR_DAYS);
  return { from: start, today: hotelToday(), firstBookable: tonight(), ...data };
}
export const CALENDAR_DAYS = 14;

/** A room asked for from the calendar: only an active room in service. */
export async function roomToAskFor(id: string): Promise<{ id: string; number: string; categoryId: string } | null> {
  await authorizeRead("reservations.manage");
  return first<{ id: string; number: string; categoryId: string }>(
    await getDb(),
    "SELECT id, room_number AS number, category_id AS categoryId FROM rooms WHERE id = ? AND is_active = 1 AND service_status = 'in_service'",
    id,
  );
}

export async function roomBoard(): Promise<BoardRoom[]> {
  await authorizeRead(["rooms.status", "reports.view"]);
  const db = await getDb();
  const today = hotelToday();
  const [rooms, stays] = await Promise.all([
    all<{ id: string; room_number: string; floor: string | null; readiness: RoomTile["readiness"]; service_status: "in_service" | "maintenance"; maintenance_note: string | null; category_id: string; category_name: string }>(
      db,
      `SELECT rm.id, rm.room_number, rm.floor, rm.readiness, rm.service_status, rm.maintenance_note, rm.category_id, c.name AS category_name
       FROM rooms rm JOIN room_categories c ON c.id = rm.category_id WHERE rm.is_active = 1`,
    ),
    roomStays(db, today),
  ]);

  const byRoom = new Map<string, typeof stays>();
  for (const s of stays) byRoom.set(s.room_id, [...(byRoom.get(s.room_id) ?? []), s]);

  return rooms
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    .map((room) => {
      const roomStays = byRoom.get(room.id) ?? [];
      const inHouse = roomStays.find((s) => s.status === "checked_in");
      const arriving = roomStays.find((s) => s.status !== "checked_in" && s.check_in === today);
      const { state, due } = boardState(
        { serviceStatus: room.service_status, readiness: room.readiness, inHouse: inHouse ? { checkOut: inHouse.check_out } : null, arrivingToday: Boolean(arriving) },
        today,
      );
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
        due,
        note: room.maintenance_note ?? undefined,
        reservationId: stay?.id,
      };
    });
}

export async function assignableRooms(reservationId: string, checkIn: string, checkOut: string) {
  await authorizeRead("reservations.manage");
  const rows = await roomChoices(await getDb(), reservationId, checkIn, checkOut, hotelToday());
  return rows.map((r) => ({ id: r.id, number: r.room_number, category: r.category_name, ready: r.readiness === "ready", blocked: r.blocked ?? undefined }));
}

export async function listCategories(): Promise<CategoryRow[]> {
  await authorizeRead(["reservations.manage", "categories.manage", "rooms.configure"]);
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
  await authorizeRead("categories.manage");
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
