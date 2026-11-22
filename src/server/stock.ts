"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { addStockItem, recordMove } from "./domain/stock";

export async function addItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("inventory.manage");
    const v = z
      .object({
        name: z.string().trim().min(2, "Enter a name").max(80),
        unit: z.string().trim().min(1, "e.g. bottles").max(20),
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
    const kind = z.enum(["received", "used", "adjusted"]).parse(formData.get("kind"));
    const staff = await authorize(kind === "used" ? "inventory.use" : "inventory.manage");
    await recordMove(await getDb(), actorOf(staff), {
      itemId: z.uuid().parse(formData.get("itemId")),
      kind,
      quantity: z.coerce.number().int("Enter a whole number").parse(formData.get("quantity")),
      note: String(formData.get("note") ?? "") || null,
    });
    refresh();
    return ok(undefined);
  } catch (err) {
    if (err instanceof z.ZodError) return toActionError(new AppError("VALIDATION", err.issues[0]?.message ?? "Check the number"));
    return toActionError(err);
  }
}
