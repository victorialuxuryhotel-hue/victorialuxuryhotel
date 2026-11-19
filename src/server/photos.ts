"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { detectImage, MAX_IMAGE_BYTES } from "@/lib/images";
import { logger } from "@/lib/logger";
import { ROOM_IMAGES, SITE_IMAGES } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";
import { throwDbError } from "./db-errors";

/**
 * Photo management for managers. Files are uploaded with the staff member's own
 * session, so storage RLS (managers only) applies on top of authorize().
 * Every change refreshes the cached public catalogue.
 */

async function run<T>(name: string, body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await body());
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(`${name}_failed`, err);
    return toActionError(err);
  }
}

function refreshPublic() {
  updateTag("catalogue");
  revalidatePath("/app/rooms/categories", "layout");
  revalidatePath("/app/settings/photos");
}

const altText = z.string().trim().min(3, "Describe the photo in a few words (for screen readers)").max(200);

/** Removes stored files; a failure is logged (the record is already gone) so it can be cleaned up. */
async function removeFiles(supabase: Awaited<ReturnType<typeof createClient>>, bucket: string, paths: string[]) {
  const { data, error } = await supabase.storage.from(bucket).remove(paths);
  if (error || (data?.length ?? 0) < paths.length) logger.error("photo.file_remove_failed", error ?? undefined, { bucket, paths });
}

async function readImage(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Choose a photo to upload.");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", "That photo is larger than 5 MB. Export it smaller and try again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) throw new AppError("VALIDATION", "Only JPEG, PNG or WebP photos can be uploaded.");
  return { bytes, kind };
}

// ---------------------------------------------------------------- Room category photos

export async function uploadCategoryPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.category_upload", async () => {
    await authorize("categories.manage");
    const categoryId = z.uuid().parse(formData.get("categoryId"));
    const alt = altText.safeParse(formData.get("altText"));
    if (!alt.success) throw new AppError("VALIDATION", alt.error.issues[0]!.message, { fieldErrors: { altText: [alt.error.issues[0]!.message] } });
    const { bytes, kind } = await readImage(formData);

    const supabase = await createClient();
    const path = `${categoryId}/${randomUUID()}.${kind.ext}`;
    const up = await supabase.storage.from(ROOM_IMAGES).upload(path, bytes, { contentType: kind.contentType, upsert: false, cacheControl: "31536000" });
    if (up.error) throw new AppError("INTERNAL", "The photo couldn't be uploaded. Please try again.", { cause: up.error });

    const { data: existing } = await supabase.from("room_category_images").select("sort_order, is_cover").eq("category_id", categoryId);
    const { error } = await supabase.from("room_category_images").insert({
      category_id: categoryId,
      storage_path: path,
      alt_text: alt.data,
      sort_order: Math.max(-1, ...(existing ?? []).map((e) => e.sort_order)) + 1,
      is_cover: !(existing ?? []).some((e) => e.is_cover),
    });
    if (error) {
      await removeFiles(supabase, ROOM_IMAGES, [path]); // don't leave an orphaned file
      throwDbError(error, "The photo couldn't be saved.");
    }
    refreshPublic();
  });
}

const photoId = z.object({ photoId: z.uuid() });

export async function deleteCategoryPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.category_delete", async () => {
    await authorize("categories.manage");
    const { photoId: id } = photoId.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: photo } = await supabase.from("room_category_images").select("category_id, storage_path, is_cover").eq("id", id).single();
    if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
    const { error } = await supabase.from("room_category_images").delete().eq("id", id);
    if (error) throwDbError(error);
    await removeFiles(supabase, ROOM_IMAGES, [photo.storage_path]);
    if (photo.is_cover) {
      const { data: next } = await supabase.from("room_category_images").select("id").eq("category_id", photo.category_id).order("sort_order").limit(1).maybeSingle();
      if (next) await supabase.from("room_category_images").update({ is_cover: true }).eq("id", next.id);
    }
    refreshPublic();
  });
}

export async function setCoverPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.set_cover", async () => {
    await authorize("categories.manage");
    const { photoId: id } = photoId.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: photo } = await supabase.from("room_category_images").select("category_id").eq("id", id).single();
    if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
    // Clear first: at most one cover per category is enforced by a unique index.
    await supabase.from("room_category_images").update({ is_cover: false }).eq("category_id", photo.category_id).eq("is_cover", true);
    const { error } = await supabase.from("room_category_images").update({ is_cover: true }).eq("id", id);
    if (error) throwDbError(error);
    refreshPublic();
  });
}

export async function moveCategoryPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.move", async () => {
    await authorize("categories.manage");
    const { photoId: id, direction } = z.object({ photoId: z.uuid(), direction: z.enum(["up", "down"]) }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: photo } = await supabase.from("room_category_images").select("category_id").eq("id", id).single();
    if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
    const { data: all } = await supabase.from("room_category_images").select("id").eq("category_id", photo.category_id).order("sort_order").order("created_at");
    const ids = (all ?? []).map((p) => p.id);
    const i = ids.indexOf(id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await Promise.all(ids.map((pid, order) => supabase.from("room_category_images").update({ sort_order: order }).eq("id", pid)));
    refreshPublic();
  });
}

export async function updatePhotoAlt(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.alt", async () => {
    await authorize("categories.manage");
    const id = z.uuid().parse(formData.get("photoId"));
    const table = formData.get("kind") === "site" ? "site_photos" : "room_category_images";
    const alt = altText.safeParse(formData.get("altText"));
    if (!alt.success) throw new AppError("VALIDATION", alt.error.issues[0]!.message);
    const { error } = await (await createClient()).from(table).update({ alt_text: alt.data }).eq("id", id);
    if (error) throwDbError(error);
    refreshPublic();
  });
}

// ---------------------------------------------------------------- Website photos

const SINGLE_SLOTS = ["hero", "welcome", "pool", "spa", "bar", "restaurant", "conference", "exterior", "reception", "about"] as const;
const GROUPS = ["Rooms", "Pool & spa", "Dining", "The hotel"] as const;

/** Upload to a website photo place. Single places are replaced; the gallery grows. */
export async function uploadSitePhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.site_upload", async () => {
    await authorize("categories.manage");
    const slot = z.enum([...SINGLE_SLOTS, "gallery"]).parse(formData.get("slot"));
    const group = slot === "gallery" ? z.enum(GROUPS, { error: "Choose a gallery section" }).parse(formData.get("galleryGroup")) : null;
    const alt = altText.safeParse(formData.get("altText"));
    if (!alt.success) throw new AppError("VALIDATION", alt.error.issues[0]!.message, { fieldErrors: { altText: [alt.error.issues[0]!.message] } });
    const { bytes, kind } = await readImage(formData);

    const supabase = await createClient();
    const path = `${slot}/${randomUUID()}.${kind.ext}`;
    const up = await supabase.storage.from(SITE_IMAGES).upload(path, bytes, { contentType: kind.contentType, upsert: false, cacheControl: "31536000" });
    if (up.error) throw new AppError("INTERNAL", "The photo couldn't be uploaded. Please try again.", { cause: up.error });

    // Replacing a single place: remove the old photo first (unique per place).
    const previous = slot === "gallery" ? null : (await supabase.from("site_photos").select("id, storage_path").eq("slot", slot).maybeSingle()).data;
    if (previous) await supabase.from("site_photos").delete().eq("id", previous.id);

    const { count } = await supabase.from("site_photos").select("id", { count: "exact", head: true }).eq("slot", slot);
    const { error } = await supabase.from("site_photos").insert({ slot, gallery_group: group, storage_path: path, alt_text: alt.data, sort_order: count ?? 0 });
    if (error) {
      await removeFiles(supabase, SITE_IMAGES, [path]);
      throwDbError(error, "The photo couldn't be saved.");
    }
    if (previous) await removeFiles(supabase, SITE_IMAGES, [previous.storage_path]);
    refreshPublic();
  });
}

export async function deleteSitePhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.site_delete", async () => {
    await authorize("categories.manage");
    const { photoId: id } = photoId.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: photo } = await supabase.from("site_photos").select("storage_path").eq("id", id).single();
    if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
    const { error } = await supabase.from("site_photos").delete().eq("id", id);
    if (error) throwDbError(error);
    await removeFiles(supabase, SITE_IMAGES, [photo.storage_path]);
    refreshPublic();
  });
}
