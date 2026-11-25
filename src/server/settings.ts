"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import * as admin from "./domain/admin";
import { updateBookingRules as save } from "./domain/admin";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, "Use a time like 14:00");

const schema = z.object({
  checkInTime: time,
  checkOutTime: time,
  websiteHoldMinutes: z.coerce.number().int().min(10, "At least 10 minutes").max(1440, "At most 24 hours"),
  staffHoldHours: z.coerce.number().int().min(1, "At least 1 hour").max(336, "At most 14 days"),
  cancellationPolicy: z.string().trim().max(2000).transform((v) => v || null),
  freeCancelHours: z.coerce.number().int().min(0).max(720, "At most 30 days"),
  lateCancelFeePct: z.coerce.number().int().min(0).max(100),
  vatRatePct: z.coerce.number().min(0).max(50).transform((v) => Math.round(v * 100)),
  vatOnReceipts: z.literal("on").optional().transform((v) => v === "on"),
});

export async function updateBookingRules(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("settings.manage");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    const v = parsed.data;
    await save(await getDb(), actorOf(staff), v);
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("settings.update_failed", err);
    return toActionError(err);
  }
}

const naira = z.coerce.number().positive("Enter an amount").max(100_000_000).transform((n) => Math.round(n * 100));

export async function addExtra(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("settings.manage");
    const v = z
      .object({ name: z.string().trim().min(2, "Enter a name").max(60), price: naira, perNight: z.string().optional() })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await admin.addExtra(await getDb(), actorOf(staff), { name: v.data.name, priceKobo: v.data.price, perNight: v.data.perNight === "on" });
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function toggleExtra(formData: FormData): Promise<void> {
  const staff = await authorize("settings.manage");
  await admin.setExtraActive(await getDb(), actorOf(staff), z.uuid().parse(formData.get("id")), formData.get("active") === "1");
  refresh();
}

export async function addPromo(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("settings.manage");
    const v = z
      .object({
        code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "3–20 letters or numbers"),
        percentOff: z.coerce.number().int().min(1, "1–90").max(90, "1–90"),
        validUntil: z.union([z.literal(""), z.iso.date()]).transform((d) => d || null),
        maxUses: z.union([z.literal(""), z.coerce.number().int().positive().max(100_000)]).transform((n) => (n === "" ? null : n)),
      })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await admin.addPromo(await getDb(), actorOf(staff), v.data);
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function togglePromo(formData: FormData): Promise<void> {
  const staff = await authorize("settings.manage");
  await admin.setPromoActive(await getDb(), actorOf(staff), z.uuid().parse(formData.get("id")), formData.get("active") === "1");
  refresh();
}
