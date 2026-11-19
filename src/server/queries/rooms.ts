import "server-only";
import type { RoomBoardState } from "@/domain/status";
import type { CategoryRow, RoomTile } from "@/domain/views";
import { publicImageUrl, ROOM_IMAGES } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { hotelToday } from "./reservations";

export type BoardRoom = RoomTile & { categoryId: string; serviceStatus: "in_service" | "maintenance"; reservationId?: string };

/**
 * Every room with its state right now. Occupancy is derived from reservations;
 * only maintenance and readiness are stored on the room itself.
 */
export async function roomBoard(): Promise<BoardRoom[]> {
  const supabase = await createClient();
  const today = await hotelToday();
  const [rooms, stays] = await Promise.all([
    supabase.from("rooms").select("id, room_number, floor, readiness, service_status, maintenance_note, category_id, category:room_categories!inner(name, sort_order)").eq("is_active", true),
    supabase
      .from("reservations")
      .select("id, room_id, status, check_in, check_out, guest:guests!inner(full_name)")
      .not("room_id", "is", null)
      .in("status", ["checked_in", "confirmed", "pending_payment"])
      .lte("check_in", today)
      .gte("check_out", today),
  ]);
  if (rooms.error || stays.error) throw new Error("Could not load rooms", { cause: rooms.error ?? stays.error });

  type Stay = { id: string; room_id: string; status: string; check_in: string; check_out: string; guest: { full_name: string } };
  const byRoom = new Map<string, Stay[]>();
  for (const s of stays.data as unknown as Stay[]) byRoom.set(s.room_id, [...(byRoom.get(s.room_id) ?? []), s]);

  type Room = { id: string; room_number: string; floor: string | null; readiness: RoomTile["readiness"]; service_status: "in_service" | "maintenance"; maintenance_note: string | null; category_id: string; category: { name: string; sort_order: number } };
  return (rooms.data as unknown as Room[])
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
        category: room.category.name,
        categoryId: room.category_id,
        floor: room.floor ?? undefined,
        state,
        readiness: room.readiness,
        serviceStatus: room.service_status,
        guestName: stay?.guest.full_name,
        until: inHouse?.check_out,
        note: room.maintenance_note ?? undefined,
        reservationId: stay?.id,
      };
    });
}

/** In-service, ready-or-not rooms of any category that are free for the given nights. */
export async function assignableRooms(reservationId: string, checkIn: string, checkOut: string) {
  const supabase = await createClient();
  const [rooms, clashes] = await Promise.all([
    supabase.from("rooms").select("id, room_number, readiness, category:room_categories!inner(name)").eq("is_active", true).eq("service_status", "in_service"),
    supabase
      .from("reservations")
      .select("room_id")
      .not("room_id", "is", null)
      .neq("id", reservationId)
      .in("status", ["pending_payment", "confirmed", "checked_in"])
      .lt("check_in", checkOut)
      .gt("check_out", checkIn),
  ]);
  if (rooms.error || clashes.error) throw new Error("Could not load rooms", { cause: rooms.error ?? clashes.error });
  const taken = new Set((clashes.data ?? []).map((c) => c.room_id));
  type R = { id: string; room_number: string; readiness: string; category: { name: string } };
  return (rooms.data as unknown as R[])
    .filter((r) => !taken.has(r.id))
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    .map((r) => ({ id: r.id, number: r.room_number, category: r.category.name, ready: r.readiness === "ready" }));
}

export async function listCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_categories")
    .select("id, name, slug, nightly_rate_kobo, max_occupancy, is_active, sort_order, rooms(count), room_category_images(count)")
    .order("sort_order")
    .order("name");
  if (error) throw new Error("Could not load categories", { cause: error });
  type C = { id: string; name: string; slug: string; nightly_rate_kobo: number; max_occupancy: number; is_active: boolean; rooms: Array<{ count: number }>; room_category_images: Array<{ count: number }> };
  return (data as unknown as C[]).map((c) => ({
    id: c.id, name: c.name, slug: c.slug, nightlyRateKobo: c.nightly_rate_kobo, maxOccupancy: c.max_occupancy,
    rooms: c.rooms[0]?.count ?? 0, images: c.room_category_images[0]?.count ?? 0, isActive: c.is_active,
  }));
}

export type CategoryDetail = CategoryRow & {
  shortDescription: string; description: string; amenities: string[]; sortOrder: number;
  photos: Array<{ id: string; url: string; alt: string; isCover: boolean }>;
};

export async function getCategory(id: string): Promise<CategoryDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("room_categories").select("*, rooms(count), photos:room_category_images(id, storage_path, alt_text, sort_order, is_cover, created_at)").eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load category", { cause: error });
  if (!data) return null;
  type P = { id: string; storage_path: string; alt_text: string; sort_order: number; is_cover: boolean; created_at: string };
  const c = data as unknown as typeof data & { rooms: Array<{ count: number }>; photos: P[] };
  return {
    id: c.id, name: c.name, slug: c.slug, nightlyRateKobo: c.nightly_rate_kobo, maxOccupancy: c.max_occupancy, isActive: c.is_active,
    rooms: c.rooms[0]?.count ?? 0, images: c.photos.length,
    shortDescription: c.short_description ?? "", description: c.description ?? "", amenities: c.amenities, sortOrder: c.sort_order,
    photos: [...c.photos]
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map((p) => ({ id: p.id, url: publicImageUrl(ROOM_IMAGES, p.storage_path), alt: p.alt_text, isCover: p.is_cover })),
  };
}
