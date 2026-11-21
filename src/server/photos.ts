"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { detectImage, MAX_IMAGE_BYTES } from "@/lib/images";
import { logger } from "@/lib/logger";
import { roomPhotoKey, sitePhotoKey } from "@/lib/media";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import * as admin from "./domain/admin";

/**
 * Photo management for managers. Files go to the PHOTOS R2 bucket; records
 * (and their audit trail) to the database. Upload stores the file first and
 * removes it again if the record can't be saved; delete removes the record
 * first, then the file. Public pages read photos per request, so changes
 * show immediately.
 */

async function run<T>(name: string, body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await body());
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(`${name}_failed`, err);
    return toActionError(err);
  }
}

const bucket = async () => (await getCloudflareContext({ async: true })).env.PHOTOS;

const altText = z.string().trim().min(3, "Describe the photo in a few words (for screen readers)").max(200);

/** Removes stored files; a failure is logged (the record is already gone) so it can be cleaned up. */
async function removeFiles(keys: string[]) {
  try {
    await (await bucket()).delete(keys);
  } catch (err) {
    logger.error("photo.file_remove_failed", err, { keys });
  }
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

function parseAlt(formData: FormData) {
  const alt = altText.safeParse(formData.get("altText"));
  if (!alt.success) throw new AppError("VALIDATION", alt.error.issues[0]!.message, { fieldErrors: { altText: [alt.error.issues[0]!.message] } });
  return alt.data;
}

async function store(key: string, bytes: Uint8Array, contentType: string) {
  try {
    await (await bucket()).put(key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
  } catch (err) {
    throw new AppError("INTERNAL", "The photo couldn't be uploaded. Please try again.", { cause: err });
  }
}

// ---------------------------------------------------------------- Room type photos

export async function uploadCategoryPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.category_upload", async () => {
    const staff = await authorize("categories.manage");
    const categoryId = z.uuid().parse(formData.get("categoryId"));
    const alt = parseAlt(formData);
    const { bytes, kind } = await readImage(formData);
    const key = roomPhotoKey(categoryId, kind.ext);
    await store(key, bytes, kind.contentType);
    try {
      await admin.addCategoryPhoto(await getDb(), actorOf(staff), { categoryId, storagePath: key, altText: alt });
    } catch (err) {
      await removeFiles([key]); // don't leave an orphaned file
      throw err;
    }
    refresh();
  });
}

const photoId = z.object({ photoId: z.uuid() });

export async function deleteCategoryPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.category_delete", async () => {
    const staff = await authorize("categories.manage");
    const { photoId: id } = photoId.parse(Object.fromEntries(formData));
    const key = await admin.deleteCategoryPhoto(await getDb(), actorOf(staff), id);
    await removeFiles([key]);
    refresh();
  });
}

export async function setCoverPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.set_cover", async () => {
    const staff = await authorize("categories.manage");
    const { photoId: id } = photoId.parse(Object.fromEntries(formData));
    await admin.setCoverPhoto(await getDb(), actorOf(staff), id);
    refresh();
  });
}

export async function moveCategoryPhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.move", async () => {
    const staff = await authorize("categories.manage");
    const { photoId: id, direction } = z.object({ photoId: z.uuid(), direction: z.enum(["up", "down"]) }).parse(Object.fromEntries(formData));
    await admin.moveCategoryPhoto(await getDb(), actorOf(staff), id, direction);
    refresh();
  });
}

export async function updatePhotoAlt(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.alt", async () => {
    const staff = await authorize("categories.manage");
    const id = z.uuid().parse(formData.get("photoId"));
    const alt = altText.safeParse(formData.get("altText"));
    if (!alt.success) throw new AppError("VALIDATION", alt.error.issues[0]!.message);
    await admin.updatePhotoAlt(await getDb(), actorOf(staff), formData.get("kind") === "site" ? "site" : "category", id, alt.data);
    refresh();
  });
}

// ---------------------------------------------------------------- Website photos

const SINGLE_SLOTS = ["hero", "welcome", "pool", "spa", "bar", "restaurant", "conference", "exterior", "reception", "about"] as const;
const GROUPS = ["Rooms", "Pool & spa", "Dining", "The hotel"] as const;

/** Upload to a website photo place. Single places are replaced; the gallery grows. */
export async function uploadSitePhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.site_upload", async () => {
    const staff = await authorize("categories.manage");
    const slot = z.enum([...SINGLE_SLOTS, "gallery"]).parse(formData.get("slot"));
    const group = slot === "gallery" ? z.enum(GROUPS, { error: "Choose a gallery section" }).parse(formData.get("galleryGroup")) : null;
    const alt = parseAlt(formData);
    const { bytes, kind } = await readImage(formData);
    const key = sitePhotoKey(slot, kind.ext);
    await store(key, bytes, kind.contentType);
    let previous: string | null;
    try {
      previous = await admin.addSitePhoto(await getDb(), actorOf(staff), { slot, galleryGroup: group, storagePath: key, altText: alt });
    } catch (err) {
      await removeFiles([key]);
      throw err;
    }
    if (previous) await removeFiles([previous]);
    refresh();
  });
}

export async function deleteSitePhoto(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("photo.site_delete", async () => {
    const staff = await authorize("categories.manage");
    const { photoId: id } = photoId.parse(Object.fromEntries(formData));
    const key = await admin.deleteSitePhoto(await getDb(), actorOf(staff), id);
    await removeFiles([key]);
    refresh();
  });
}
