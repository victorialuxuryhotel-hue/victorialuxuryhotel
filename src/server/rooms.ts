"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MIN_NIGHTLY_RATE_KOBO } from "@/domain/pricing";
import { recordId } from "@/lib/ids";
import { formatNaira } from "@/lib/format";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { createRoom as addRoom, saveCategory as save } from "./domain/admin";
import { markTidied as tidied } from "./domain/housekeeping";
import { updateRoomStatus as setRoomStatus } from "./domain/reservations";

async function run<T>(name: string, body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await body());
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(`${name}_failed`, err);
    return toActionError(err);
  }
}

const statusSchema = z.object({
  roomId: recordId(),
  readiness: z.enum(["needs_cleaning", "cleaning_in_progress", "ready"]).optional(),
  serviceStatus: z.enum(["in_service", "maintenance"]).optional(),
  note: z.string().max(200).optional(),
});

export async function updateRoomStatus(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("room.status", async () => {
    const staff = await authorize("rooms.status");
    const v = statusSchema.parse(Object.fromEntries([...formData.entries()].filter(([, val]) => val !== "")));
    await setRoomStatus(await getDb(), actorOf(staff), { roomId: v.roomId, readiness: v.readiness, serviceStatus: v.serviceStatus, note: v.note ?? null });
    refresh();
  });
}

export async function markTidied(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("room.tidied", async () => {
    const staff = await authorize("rooms.status");
    await tidied(await getDb(), actorOf(staff), recordId().parse(formData.get("roomId")));
    refresh();
  });
}

const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Enter a room number").max(10),
  categoryId: z.uuid("Choose a category"),
  floor: z.string().trim().max(10).optional(),
});

export async function createRoom(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("room.create", async () => {
    const staff = await authorize("rooms.configure");
    const parsed = roomSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    await addRoom(await getDb(), actorOf(staff), { roomNumber: v.roomNumber, categoryId: v.categoryId, floor: v.floor || null });
    refresh();
  });
}

const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter a name").max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only"),
  shortDescription: z.string().trim().max(200),
  description: z.string().trim().max(4000),
  amenities: z.string().max(2000),
  nightlyRate: z.coerce
    .number({ error: "Enter the nightly rate" })
    .min(MIN_NIGHTLY_RATE_KOBO / 100, `The minimum rate is ${formatNaira(MIN_NIGHTLY_RATE_KOBO)} a night`)
    .max(100_000_000),
  maxOccupancy: z.coerce.number().int().min(1).max(20),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.literal("on").optional(),
});

export async function saveCategory(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await run("category.save", async () => {
    const staff = await authorize("categories.manage");
    const raw = Object.fromEntries(formData);
    const parsed = categorySchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    const v = parsed.data;
    await save(await getDb(), actorOf(staff), {
      id: v.id,
      name: v.name,
      slug: v.slug,
      shortDescription: v.shortDescription || null,
      description: v.description || null,
      amenities: v.amenities.split("\n").map((a) => a.trim()).filter(Boolean).slice(0, 30),
      nightlyRateKobo: Math.round(v.nightlyRate * 100),
      maxOccupancy: v.maxOccupancy,
      sortOrder: v.sortOrder,
      isActive: v.isActive === "on",
    });
    refresh();
  });
  if (result.ok) redirect("/app/rooms/categories");
  return result;
}
