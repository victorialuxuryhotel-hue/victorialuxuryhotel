import { AppError } from "@/lib/errors";
import { dbErrorToken } from "../db-errors";
import { hotelDateOf } from "@/lib/hotel-date";
import { activity, activityIfChanged, all, ALL_STAFF, first, MANAGERS, OWNER, requireRole, uuid, writeBatch, type Actor, type Db, type StaffRole } from "../db";
import { formatNaira } from "@/lib/format";

function conflictOnUnique(err: unknown, message: string): never {
  if (err instanceof AppError && dbErrorToken(err.cause) === "unique") throw new AppError("CONFLICT", message);
  throw err;
}

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

export async function addCategoryPhoto(db: Db, actor: Actor, v: { categoryId: string; storagePath: string; altText: string }): Promise<void> {
  requireRole(actor, MANAGERS);
  if (!(await first(db, "SELECT 1 FROM room_categories WHERE id = ?", v.categoryId))) throw new AppError("NOT_FOUND", "Room type not found.");
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

export async function deleteCategoryPhoto(db: Db, actor: Actor, photoId: string): Promise<string> {
  requireRole(actor, MANAGERS);
  const photo = await first<{ category_id: string; storage_path: string; is_cover: number }>(
    db,
    "SELECT category_id, storage_path, is_cover FROM room_category_images WHERE id = ?",
    photoId,
  );
  if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
  const stmts = [db.prepare("DELETE FROM room_category_images WHERE id = ?").bind(photoId)];
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

export async function updateBookingRules(
  db: Db,
  actor: Actor,
  v: {
    checkInTime: string; checkOutTime: string; websiteHoldMinutes: number; staffHoldHours: number; cancellationPolicy: string | null;
    freeCancelHours: number; lateCancelFeePct: number; vatRatePct: number;
  },
): Promise<void> {
  requireRole(actor, MANAGERS);
  const hhmm = (t: string) => t.slice(0, 5);
  await writeBatch(db, actor, [
    db
      .prepare(
        `UPDATE hotel_settings SET check_in_time = ?, check_out_time = ?, website_hold_minutes = ?, staff_hold_hours = ?, cancellation_policy = ?,
           free_cancel_hours = ?, late_cancel_fee_pct = ?, vat_rate_bp = ?
         WHERE id = 1`,
      )
      .bind(hhmm(v.checkInTime), hhmm(v.checkOutTime), v.websiteHoldMinutes, v.staffHoldHours, v.cancellationPolicy, v.freeCancelHours, v.lateCancelFeePct, v.vatRatePct),
  ]);
}

export const ROLE = "(CASE WHEN department = 'restaurant_bar' AND department_lead = 1 THEN 'restaurant_bar_manager' ELSE coalesce(department, role) END)";

export function storedRole(role: StaffRole): { role: "owner" | "general_manager" | "front_desk"; department: "finance" | "restaurant_bar" | null; lead: 0 | 1 } {
  if (role === "restaurant_bar_manager") return { role: "front_desk", department: "restaurant_bar", lead: 1 };
  return role === "finance" || role === "restaurant_bar" ? { role: "front_desk", department: role, lead: 0 } : { role, department: null, lead: 0 };
}

export type StaffRecord = {
  id: string; clerk_user_id: string | null; full_name: string; email: string; role: StaffRole; is_active: number; last_seen_at?: string | null;
};

export async function createStaffProfile(db: Db, actor: Actor, v: { fullName: string; email: string; role: StaffRole; phone?: string | null }): Promise<string> {
  requireRole(actor, OWNER);
  if (v.role === "owner") throw new AppError("VALIDATION", "Invite as general manager or front desk. Make them owner afterwards.");
  const id = uuid();
  try {
    await writeBatch(db, actor, [
      db
        .prepare("INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead, phone) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, v.fullName.trim(), v.email.trim().toLowerCase(), storedRole(v.role).role, storedRole(v.role).department, storedRole(v.role).lead, v.phone?.trim() || null),
    ]);
  } catch (err) {
    conflictOnUnique(err, "Someone with this email already has an account.");
  }
  return id;
}

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

export async function updateStaffProfile(
  db: Db,
  actor: Actor,
  v: { staffId: string; role: StaffRole; isActive: boolean; phone?: string | null },
): Promise<StaffRecord> {
  requireRole(actor, OWNER);
  if (v.staffId === actor.id && !v.isActive) throw new AppError("VALIDATION", "You can't deactivate your own account.");
  if (v.role === "owner") {
    const current = await first<{ role: StaffRole }>(db, `SELECT ${ROLE} AS role FROM staff_profiles WHERE id = ?`, v.staffId);
    if (current && current.role !== "owner") throw new AppError("VALIDATION", "Use “Make owner” to give someone owner access.");
  }
  const [result] = await writeBatch(db, actor, [
    v.phone === undefined
      ? db
          .prepare("UPDATE staff_profiles SET role = ?, department = ?, department_lead = ?, is_active = ? WHERE id = ?")
          .bind(storedRole(v.role).role, storedRole(v.role).department, storedRole(v.role).lead, v.isActive ? 1 : 0, v.staffId)
      : db
          .prepare("UPDATE staff_profiles SET role = ?, department = ?, department_lead = ?, is_active = ?, phone = ? WHERE id = ?")
          .bind(storedRole(v.role).role, storedRole(v.role).department, storedRole(v.role).lead, v.isActive ? 1 : 0, v.phone?.trim() || null, v.staffId),
  ]).catch((err: unknown) => {
    if (err instanceof AppError && dbErrorToken(err.cause) === "last_owner") throw new AppError("CONFLICT", "The hotel must always have at least one active owner.");
    throw err;
  });
  if (!result?.meta.changes) throw new AppError("NOT_FOUND", "Staff member not found.");
  return (await first<StaffRecord>(db, `SELECT id, clerk_user_id, full_name, email, ${ROLE} AS role, is_active FROM staff_profiles WHERE id = ?`, v.staffId))!;
}

export async function promoteToOwner(db: Db, actor: Actor, staffId: string): Promise<StaffRecord> {
  requireRole(actor, OWNER);
  const current = await first<{ role: StaffRole; is_active: number }>(db, `SELECT ${ROLE} AS role, is_active FROM staff_profiles WHERE id = ?`, staffId);
  if (!current) throw new AppError("NOT_FOUND", "Staff member not found.");
  if (!current.is_active) throw new AppError("VALIDATION", "Restore their access before making them owner.");
  if (current.role !== "owner") {
    await writeBatch(db, actor, [db.prepare("UPDATE staff_profiles SET role = 'owner', department = NULL, department_lead = 0 WHERE id = ? AND is_active = 1").bind(staffId)]);
  }
  return (await first<StaffRecord>(db, `SELECT id, clerk_user_id, full_name, email, ${ROLE} AS role, is_active FROM staff_profiles WHERE id = ?`, staffId))!;
}

export async function linkClerkUser(db: Db, clerkUserId: string, email: string): Promise<StaffRecord | null> {
  await db
    .prepare("UPDATE staff_profiles SET clerk_user_id = ? WHERE email = ? AND clerk_user_id IS NULL")
    .bind(clerkUserId, email.trim().toLowerCase())
    .run();
  return first<StaffRecord>(db, `SELECT id, clerk_user_id, full_name, email, ${ROLE} AS role, is_active FROM staff_profiles WHERE clerk_user_id = ?`, clerkUserId);
}

export async function touchLastSeen(db: Db, staffId: string, at: string = new Date().toISOString()): Promise<void> {
  await db.prepare("UPDATE staff_profiles SET last_seen_at = ? WHERE id = ? AND is_active = 1").bind(at, staffId).run();
}

export const LAST_SEEN_EVERY_MS = 60 * 60 * 1000;

export type ManagerToAsk = { name: string; role: "general_manager" | "owner"; phone: string | null; activeToday: boolean };

export async function managerToAsk(db: Db, actor: Actor, today: string): Promise<ManagerToAsk | null> {
  requireRole(actor, ALL_STAFF);
  const row = await first<{ full_name: string; role: "general_manager" | "owner"; phone: string | null; last_seen_at: string | null }>(
    db,
    `SELECT full_name, role, phone, last_seen_at FROM staff_profiles
     WHERE is_active = 1 AND role IN ('general_manager', 'owner')
     ORDER BY role = 'general_manager' DESC, last_seen_at IS NULL, last_seen_at DESC, full_name
     LIMIT 1`,
  );
  if (!row) return null;
  return {
    name: row.full_name,
    role: row.role,
    phone: row.phone,
    activeToday: row.last_seen_at ? hotelDateOf(row.last_seen_at) === today : false,
  };
}

export async function addExtra(db: Db, actor: Actor, v: { name: string; priceKobo: number; perNight: boolean }): Promise<string> {
  requireRole(actor, MANAGERS);
  const id = uuid();
  await writeBatch(db, actor, [
    db.prepare("INSERT INTO extras (id, name, price_kobo, per_night) VALUES (?, ?, ?, ?)").bind(id, v.name.trim(), v.priceKobo, v.perNight ? 1 : 0),
    activity(db, "extra.created", "extra", id, `Extra added: ${v.name.trim()} (${formatNaira(v.priceKobo)}${v.perNight ? " a night" : ""})`),
  ]);
  return id;
}

export async function setExtraActive(db: Db, actor: Actor, id: string, active: boolean): Promise<void> {
  requireRole(actor, MANAGERS);
  const [r] = await writeBatch(db, actor, [
    db.prepare("UPDATE extras SET is_active = ?1 WHERE id = ?2 AND is_active <> ?1").bind(active ? 1 : 0, id),
    activityIfChanged(db, active ? "extra.shown" : "extra.hidden", "extra", id, `Extra ${active ? "offered again" : "no longer offered"}`),
  ]);
  if (!r?.meta.changes && !(await first(db, "SELECT 1 FROM extras WHERE id = ?", id))) throw new AppError("NOT_FOUND", "Extra not found.");
}

export async function addPromo(
  db: Db,
  actor: Actor,
  v: { code: string; percentOff: number; validUntil: string | null; maxUses: number | null },
): Promise<string> {
  requireRole(actor, MANAGERS);
  if (!Number.isInteger(v.percentOff) || v.percentOff < 1 || v.percentOff > 90) throw new AppError("VALIDATION", "Choose 1–90% off.");
  const id = uuid();
  const code = v.code.trim().toUpperCase();
  try {
    await writeBatch(db, actor, [
      db
        .prepare("INSERT INTO promo_codes (id, code, percent_off, valid_until, max_uses, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, code, v.percentOff, v.validUntil, v.maxUses, actor?.id ?? null),
      activity(db, "promo.created", "promo_code", id, `Promo code ${code} created: ${v.percentOff}% off`, { valid_until: v.validUntil, max_uses: v.maxUses }),
    ]);
  } catch (err) {
    conflictOnUnique(err, "That code already exists.");
  }
  return id;
}

export async function setPromoActive(db: Db, actor: Actor, id: string, active: boolean): Promise<void> {
  requireRole(actor, MANAGERS);
  const [r] = await writeBatch(db, actor, [
    db.prepare("UPDATE promo_codes SET is_active = ?1 WHERE id = ?2 AND is_active <> ?1").bind(active ? 1 : 0, id),
    activityIfChanged(db, active ? "promo.enabled" : "promo.disabled", "promo_code", id, `Promo code ${active ? "switched on" : "switched off"}`),
  ]);
  if (!r?.meta.changes && !(await first(db, "SELECT 1 FROM promo_codes WHERE id = ?", id))) throw new AppError("NOT_FOUND", "Promo code not found.");
}
