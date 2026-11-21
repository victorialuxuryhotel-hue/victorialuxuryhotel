import { AppError } from "@/lib/errors";
import { dbErrorToken } from "../db-errors";
import { activity, all, first, MANAGERS, OWNER, requireRole, uuid, writeBatch, type Actor, type Db, type StaffRole } from "../db";

/**
 * Configuration: room types, rooms, photos, booking rules and staff.
 * Managers only (staff: owner only). Audit records for these changes are
 * written by triggers (migrations/0004), attributed via the request context.
 */

function conflictOnUnique(err: unknown, message: string): never {
  if (err instanceof AppError && dbErrorToken(err.cause) === "unique") throw new AppError("CONFLICT", message);
  throw err;
}

// ---------------------------------------------------------------------------
// Room types and rooms
// ---------------------------------------------------------------------------

export type CategoryInput = {
  id?: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  amenities: string[];
  nightlyRateKobo: number;
  maxOccupancy: number;
  sortOrder: number;
  isActive: boolean;
};

export async function saveCategory(db: Db, actor: Actor, v: CategoryInput): Promise<string> {
  requireRole(actor, MANAGERS);
  const id = v.id ?? uuid();
  const values = [v.name, v.slug, v.shortDescription, v.description, JSON.stringify(v.amenities), v.nightlyRateKobo, v.maxOccupancy, v.sortOrder, v.isActive ? 1 : 0];
  try {
    const [result] = await writeBatch(db, actor, [
      v.id
        ? db
            .prepare(
              `UPDATE room_categories SET name = ?, slug = ?, short_description = ?, description = ?, amenities = ?,
                 nightly_rate_kobo = ?, max_occupancy = ?, sort_order = ?, is_active = ? WHERE id = ?`,
            )
            .bind(...values, id)
        : db
            .prepare(
              `INSERT INTO room_categories (name, slug, short_description, description, amenities, nightly_rate_kobo, max_occupancy, sort_order, is_active, id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(...values, id),
    ]);
    if (!result?.meta.changes) throw new AppError("NOT_FOUND", "Room type not found.");
  } catch (err) {
    conflictOnUnique(err, "A category with this name or web address already exists.");
  }
  return id;
}

export async function createRoom(db: Db, actor: Actor, v: { roomNumber: string; categoryId: string; floor: string | null }): Promise<void> {
  requireRole(actor, MANAGERS);
  if (!(await first(db, "SELECT 1 FROM room_categories WHERE id = ?", v.categoryId))) throw new AppError("VALIDATION", "Choose a category");
  try {
    await writeBatch(db, actor, [
      db.prepare("INSERT INTO rooms (id, room_number, category_id, floor) VALUES (?, ?, ?, ?)").bind(uuid(), v.roomNumber.trim(), v.categoryId, v.floor?.trim() || null),
    ]);
  } catch (err) {
    conflictOnUnique(err, `Room ${v.roomNumber} already exists.`);
  }
}

// ---------------------------------------------------------------------------
// Photo records (the files themselves are in R2; see src/server/photos.ts)
// ---------------------------------------------------------------------------

export async function addCategoryPhoto(db: Db, actor: Actor, v: { categoryId: string; storagePath: string; altText: string }): Promise<void> {
  requireRole(actor, MANAGERS);
  if (!(await first(db, "SELECT 1 FROM room_categories WHERE id = ?", v.categoryId))) throw new AppError("NOT_FOUND", "Room type not found.");
  // Next position and "first photo is the cover", computed inside the insert.
  await writeBatch(db, actor, [
    db
      .prepare(
        `INSERT INTO room_category_images (id, category_id, storage_path, alt_text, sort_order, is_cover)
         VALUES (?1, ?2, ?3, ?4,
                 (SELECT coalesce(max(sort_order), -1) + 1 FROM room_category_images WHERE category_id = ?2),
                 NOT EXISTS (SELECT 1 FROM room_category_images WHERE category_id = ?2 AND is_cover = 1))`,
      )
      .bind(uuid(), v.categoryId, v.storagePath, v.altText.trim()),
  ]);
}

/** Deletes the record and returns the file's key so the caller can remove it. */
export async function deleteCategoryPhoto(db: Db, actor: Actor, photoId: string): Promise<string> {
  requireRole(actor, MANAGERS);
  const photo = await first<{ category_id: string; storage_path: string; is_cover: number }>(
    db,
    "SELECT category_id, storage_path, is_cover FROM room_category_images WHERE id = ?",
    photoId,
  );
  if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
  const stmts = [db.prepare("DELETE FROM room_category_images WHERE id = ?").bind(photoId)];
  // The next photo becomes the cover.
  if (photo.is_cover) {
    stmts.push(
      db
        .prepare(
          `UPDATE room_category_images SET is_cover = 1 WHERE id = (
             SELECT id FROM room_category_images WHERE category_id = ? ORDER BY sort_order, created_at LIMIT 1)`,
        )
        .bind(photo.category_id),
    );
  }
  await writeBatch(db, actor, stmts);
  return photo.storage_path;
}

export async function setCoverPhoto(db: Db, actor: Actor, photoId: string): Promise<void> {
  requireRole(actor, MANAGERS);
  const photo = await first<{ category_id: string }>(db, "SELECT category_id FROM room_category_images WHERE id = ?", photoId);
  if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
  // Clear first: at most one cover per category (unique index). One batch, so never zero covers.
  await writeBatch(db, actor, [
    db.prepare("UPDATE room_category_images SET is_cover = 0 WHERE category_id = ? AND is_cover = 1").bind(photo.category_id),
    db.prepare("UPDATE room_category_images SET is_cover = 1 WHERE id = ?").bind(photoId),
  ]);
}

export async function moveCategoryPhoto(db: Db, actor: Actor, photoId: string, direction: "up" | "down"): Promise<void> {
  requireRole(actor, MANAGERS);
  const photo = await first<{ category_id: string }>(db, "SELECT category_id FROM room_category_images WHERE id = ?", photoId);
  if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
  const ids = (await all<{ id: string }>(db, "SELECT id FROM room_category_images WHERE category_id = ? ORDER BY sort_order, created_at", photo.category_id)).map((p) => p.id);
  const i = ids.indexOf(photoId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await writeBatch(db, actor, ids.map((id, order) => db.prepare("UPDATE room_category_images SET sort_order = ? WHERE id = ?").bind(order, id)));
}

export async function updatePhotoAlt(db: Db, actor: Actor, kind: "site" | "category", photoId: string, altText: string): Promise<void> {
  requireRole(actor, MANAGERS);
  const table = kind === "site" ? "site_photos" : "room_category_images";
  const [result] = await writeBatch(db, actor, [db.prepare(`UPDATE ${table} SET alt_text = ? WHERE id = ?`).bind(altText.trim(), photoId)]);
  if (!result?.meta.changes) throw new AppError("NOT_FOUND", "Photo not found.");
}

/**
 * Adds a website photo. Single places are replaced (returns the old file's key
 * for the caller to remove); the gallery grows.
 */
export async function addSitePhoto(
  db: Db,
  actor: Actor,
  v: { slot: string; galleryGroup: string | null; storagePath: string; altText: string },
): Promise<string | null> {
  requireRole(actor, MANAGERS);
  const previous = v.slot === "gallery" ? null : await first<{ storage_path: string }>(db, "SELECT storage_path FROM site_photos WHERE slot = ?", v.slot);
  await writeBatch(db, actor, [
    ...(v.slot === "gallery" ? [] : [db.prepare("DELETE FROM site_photos WHERE slot = ?").bind(v.slot)]),
    db
      .prepare(
        `INSERT INTO site_photos (id, slot, gallery_group, storage_path, alt_text, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, (SELECT count(*) FROM site_photos WHERE slot = ?2))`,
      )
      .bind(uuid(), v.slot, v.galleryGroup, v.storagePath, v.altText.trim()),
  ]);
  return previous?.storage_path ?? null;
}

export async function deleteSitePhoto(db: Db, actor: Actor, photoId: string): Promise<string> {
  requireRole(actor, MANAGERS);
  const photo = await first<{ storage_path: string }>(db, "SELECT storage_path FROM site_photos WHERE id = ?", photoId);
  if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
  await writeBatch(db, actor, [db.prepare("DELETE FROM site_photos WHERE id = ?").bind(photoId)]);
  return photo.storage_path;
}

// ---------------------------------------------------------------------------
// Booking rules
// ---------------------------------------------------------------------------

export async function updateBookingRules(
  db: Db,
  actor: Actor,
  v: { checkInTime: string; checkOutTime: string; websiteHoldMinutes: number; staffHoldHours: number; cancellationPolicy: string | null },
): Promise<void> {
  requireRole(actor, MANAGERS);
  const hhmm = (t: string) => t.slice(0, 5);
  await writeBatch(db, actor, [
    db
      .prepare(
        `UPDATE hotel_settings SET check_in_time = ?, check_out_time = ?, website_hold_minutes = ?, staff_hold_hours = ?, cancellation_policy = ?
         WHERE id = 1`,
      )
      .bind(hhmm(v.checkInTime), hhmm(v.checkOutTime), v.websiteHoldMinutes, v.staffHoldHours, v.cancellationPolicy),
  ]);
}

// ---------------------------------------------------------------------------
// Staff (owner only). Identity is Clerk; role and access live here.
// ---------------------------------------------------------------------------

export type StaffRecord = { id: string; clerk_user_id: string | null; full_name: string; email: string; role: StaffRole; is_active: number };

export async function createStaffProfile(db: Db, actor: Actor, v: { fullName: string; email: string; role: StaffRole }): Promise<string> {
  requireRole(actor, OWNER);
  const id = uuid();
  try {
    await writeBatch(db, actor, [
      db.prepare("INSERT INTO staff_profiles (id, full_name, email, role) VALUES (?, ?, ?, ?)").bind(id, v.fullName.trim(), v.email.trim().toLowerCase(), v.role),
    ]);
  } catch (err) {
    conflictOnUnique(err, "Someone with this email already has an account.");
  }
  return id;
}

/** Bootstrap only (CLI): the very first owner, before anyone can sign in. */
export async function createFirstOwner(db: Db, v: { fullName: string; email: string }): Promise<string> {
  if (await first(db, "SELECT 1 FROM staff_profiles WHERE role = 'owner' AND is_active = 1")) {
    throw new AppError("CONFLICT", "An owner already exists. Invite staff from the app instead.");
  }
  const id = uuid();
  await writeBatch(db, null, [
    db.prepare("INSERT INTO staff_profiles (id, full_name, email, role) VALUES (?, ?, ?, 'owner')").bind(id, v.fullName.trim(), v.email.trim().toLowerCase()),
  ]);
  return id;
}

/** Change role or access. The "keep an owner" trigger and the audit trigger apply. */
export async function updateStaffProfile(db: Db, actor: Actor, v: { staffId: string; role: StaffRole; isActive: boolean }): Promise<StaffRecord> {
  requireRole(actor, OWNER);
  if (v.staffId === actor.id && !v.isActive) throw new AppError("VALIDATION", "You can't deactivate your own account.");
  const [result] = await writeBatch(db, actor, [
    db.prepare("UPDATE staff_profiles SET role = ?, is_active = ? WHERE id = ?").bind(v.role, v.isActive ? 1 : 0, v.staffId),
  ]).catch((err: unknown) => {
    if (err instanceof AppError && dbErrorToken(err.cause) === "last_owner") throw new AppError("CONFLICT", "The hotel must always have at least one active owner.");
    throw err;
  });
  if (!result?.meta.changes) throw new AppError("NOT_FOUND", "Staff member not found.");
  return (await first<StaffRecord>(db, "SELECT id, clerk_user_id, full_name, email, role, is_active FROM staff_profiles WHERE id = ?", v.staffId))!;
}

/** Links a Clerk user to the invited staff record with the same (verified) email, on first sign-in. */
export async function linkClerkUser(db: Db, clerkUserId: string, email: string): Promise<StaffRecord | null> {
  await db
    .prepare("UPDATE staff_profiles SET clerk_user_id = ? WHERE email = ? AND clerk_user_id IS NULL")
    .bind(clerkUserId, email.trim().toLowerCase())
    .run();
  return first<StaffRecord>(db, "SELECT id, clerk_user_id, full_name, email, role, is_active FROM staff_profiles WHERE clerk_user_id = ?", clerkUserId);
}

export { activity };
