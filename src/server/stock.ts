"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { recordId } from "@/lib/ids";
import { addStockItem, recordDelivery, recordMove, updateStockItem } from "./domain/stock";

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

/** Record a delivery (X12): quantity received, supplier, optional cost in naira, and a note for the invoice. */
export async function receiveDelivery(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("inventory.manage");
    const v = z
      .object({
        itemId: recordId("Choose the item"),
        quantity: z.coerce.number("Enter how many came in").int("Enter a whole number").min(1, "Enter how many came in").max(1_000_000),
        supplier: z.string().trim().min(2, "Enter who supplied it").max(80, "Keep the supplier short"),
        cost: z
          .string()
          .transform((s) => s.replace(/[,\s₦]/g, ""))
          .refine((s) => s === "" || (/^\d+(\.\d{1,2})?$/.test(s) && Number(s) <= 100_000_000), "Enter the cost in naira, or leave it empty")
          .transform((s) => (s === "" ? null : Math.round(Number(s) * 100))),
        note: z.string().trim().max(200, "Keep the note short"),
      })
      .safeParse({
        itemId: formData.get("itemId") ?? "",
        quantity: formData.get("quantity") ?? "",
        supplier: formData.get("supplier") ?? "",
        cost: String(formData.get("cost") ?? ""),
        note: String(formData.get("note") ?? ""),
      });
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await recordDelivery(await getDb(), actorOf(staff), { ...v.data, costKobo: v.data.cost, note: v.data.note || null });
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
