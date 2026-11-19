"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";
import { throwDbError } from "./db-errors";

async function run<T>(name: string, body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await body());
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(`${name}_failed`, err);
    return toActionError(err);
  }
}

const statusSchema = z.object({
  roomId: z.uuid(),
  readiness: z.enum(["needs_cleaning", "cleaning_in_progress", "ready"]).optional(),
  serviceStatus: z.enum(["in_service", "maintenance"]).optional(),
  note: z.string().max(200).optional(),
});

/** Readiness and maintenance: any staff member, via the audited database function. */
export async function updateRoomStatus(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("room.status", async () => {
    await authorize("rooms.status");
    const v = statusSchema.parse(Object.fromEntries([...formData.entries()].filter(([, val]) => val !== "")));
    const { error } = await (await createClient()).rpc("update_room_status", {
      p_room_id: v.roomId, p_readiness: v.readiness, p_service_status: v.serviceStatus, p_note: v.note,
    });
    if (error) throwDbError(error);
    revalidatePath("/app", "layout");
  });
}

const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Enter a room number").max(10),
  categoryId: z.uuid("Choose a category"),
  floor: z.string().trim().max(10).optional(),
});

export async function createRoom(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("room.create", async () => {
    await authorize("rooms.configure");
    const parsed = roomSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const { error } = await (await createClient()).from("rooms").insert({ room_number: v.roomNumber, category_id: v.categoryId, floor: v.floor || null });
    if (error) {
      if (error.code === "23505") throw new AppError("CONFLICT", `Room ${v.roomNumber} already exists.`);
      throwDbError(error);
    }
    revalidatePath("/app/rooms");
  });
}

const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter a name").max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only"),
  shortDescription: z.string().trim().max(200),
  description: z.string().trim().max(4000),
  amenities: z.string().max(2000),
  nightlyRate: z.coerce.number().positive("Enter the nightly rate").max(100_000_000),
  maxOccupancy: z.coerce.number().int().min(1).max(20),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.literal("on").optional(),
});

/** Create or update a room category. Rates are entered in naira and stored in kobo. */
export async function saveCategory(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await run("category.save", async () => {
    await authorize("categories.manage");
    const raw = Object.fromEntries(formData);
    const parsed = categorySchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    const row = {
      name: v.name,
      slug: v.slug,
      short_description: v.shortDescription || null,
      description: v.description || null,
      amenities: v.amenities.split("\n").map((a) => a.trim()).filter(Boolean).slice(0, 30),
      nightly_rate_kobo: Math.round(v.nightlyRate * 100),
      max_occupancy: v.maxOccupancy,
      sort_order: v.sortOrder,
      is_active: v.isActive === "on",
    };
    const supabase = await createClient();
    const { error } = v.id ? await supabase.from("room_categories").update(row).eq("id", v.id) : await supabase.from("room_categories").insert(row);
    if (error) {
      if (error.code === "23505") throw new AppError("CONFLICT", "A category with this name or web address already exists.");
      throwDbError(error);
    }
    updateTag("catalogue"); // public room pages show the change immediately
    revalidatePath("/app/rooms", "layout");
  });
  if (result.ok) redirect("/app/rooms/categories");
  return result;
}
