"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { recordId } from "@/lib/ids";
import { addStockItem, recordMove, updateStockItem } from "./domain/stock";

export async function addItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("inventory.manage");
    const v = z
      .object({
        name: z.string().trim().min(2, "Enter a name").max(80),
        unit: z.string().trim().min(1, "e.g. bottles").max(20),
        category: z.enum(["drinks", "food", "ingredients", "supplies", "other"]).default("other"),
        minQuantity: z.coerce.number().int().min(0).max(1_000_000),
        opening: z.coerce.number().int().min(0).max(1_000_000),
      })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await addStockItem(await getDb(), actorOf(staff), v.data);
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function moveStock(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const kind = z.enum(["received", "used", "adjusted", "wasted"]).parse(formData.get("kind"));
    const staff = await authorize("inventory.manage");
    await recordMove(await getDb(), actorOf(staff), {
      itemId: recordId().parse(formData.get("itemId")),
      kind,
      quantity: z.coerce.number().int("Enter a whole number").min(-1_000_000).max(1_000_000).parse(formData.get("quantity")),
      note: z.string().trim().max(200, "Keep the note short").parse(String(formData.get("note") ?? "")) || null,
    });
    refresh();
    return ok(undefined);
  } catch (err) {
    if (err instanceof z.ZodError) return toActionError(new AppError("VALIDATION", err.issues[0]?.message ?? "Check the number"));
    return toActionError(err);
  }
}

export async function editStockItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("inventory.manage");
    const v = z
      .object({
        id: recordId(),
        category: z.enum(["drinks", "food", "ingredients", "supplies", "other"]),
        minQuantity: z.coerce.number().int("Enter a whole number").min(0).max(1_000_000),
      })
      .parse(Object.fromEntries(formData));
    await updateStockItem(await getDb(), actorOf(staff), v.id, { category: v.category, minQuantity: v.minQuantity, active: formData.get("active") !== "0" });
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
