"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { recordId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import * as pos from "./domain/pos";

const outlet = z.enum(["restaurant", "bar"]);
const method = z.enum(["cash", "bank_transfer", "pos_terminal"], "Choose how the customer paid");
const lines = z.array(z.object({ menuItemId: recordId(), quantity: z.number().int().min(1).max(99) })).min(1, "Add at least one item").max(50);
const naira = z.coerce.number().min(0).max(100_000_000).transform((n) => Math.round(n * 100));
const fail = (err: unknown, event: string) => {
  if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(event, err);
  return toActionError(err);
};
const parseLines = (formData: FormData) => lines.parse(JSON.parse(String(formData.get("lines") ?? "[]")));

export type PaidResult = pos.PaidOrder;

export async function saveOpenOrder(_prev: ActionResult<{ id: string; number: number }> | null, formData: FormData): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const staff = await authorize("pos.sell");
    const r = await pos.saveOrder(await getDb(), actorOf(staff), {
      id: recordId().parse(formData.get("id")),
      outlet: outlet.parse(formData.get("outlet")),
      lines: parseLines(formData),
      note: z.string().max(120).parse(String(formData.get("note") ?? "")),
    });
    refresh();
    return ok({ id: r.id, number: r.number });
  } catch (err) {
    return fail(err, "pos.save_failed");
  }
}

export async function takePayment(_prev: ActionResult<PaidResult> | null, formData: FormData): Promise<ActionResult<PaidResult>> {
  try {
    const staff = await authorize("pos.sell");
    const cash = formData.get("cashReceived") ? naira.parse(formData.get("cashReceived")) : null;
    const r = await pos.payOrder(await getDb(), actorOf(staff), {
      id: recordId().parse(formData.get("id")),
      ...(formData.get("lines") ? { outlet: outlet.parse(formData.get("outlet")), lines: parseLines(formData) } : {}),
      note: z.string().max(120).parse(String(formData.get("note") ?? "")),
      method: method.parse(formData.get("method")),
      cashReceivedKobo: cash,
    });
    refresh();
    return ok(r);
  } catch (err) {
    return fail(err, "pos.pay_failed");
  }
}

export async function cancelOpenOrder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.sell");
    await pos.cancelOrder(await getDb(), actorOf(staff), recordId().parse(formData.get("id")), z.string().max(200).parse(String(formData.get("reason") ?? "")) || null);
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.cancel_failed");
  }
}

export async function voidSale(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.manage");
    await pos.voidOrder(await getDb(), actorOf(staff), recordId().parse(formData.get("id")), z.string().max(200).parse(String(formData.get("reason") ?? "")));
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.void_failed");
  }
}

export async function saveMenuItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.manage");
    const v = z
      .object({
        id: z.union([z.literal(""), recordId()]).optional(),
        name: z.string().trim().min(2, "Enter the item's name").max(80),
        outlet,
        category: z.enum(["meals", "snacks", "soft_drinks", "alcoholic_drinks", "other"], "Choose a category"),
        price: z.coerce.number().positive("Enter a price").max(10_000_000).transform((n) => Math.round(n * 100)),
      })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await pos.saveMenuItem(await getDb(), actorOf(staff), {
      id: v.data.id || undefined,
      name: v.data.name,
      outlet: v.data.outlet,
      category: v.data.category,
      priceKobo: v.data.price,
      available: formData.get("available") !== "0",
      active: formData.get("active") !== "0",
    });
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.menu_failed");
  }
}

export async function saveMenuStock(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.manage");
    const links = z
      .array(z.object({ stockItemId: recordId(), quantity: z.number().int().min(1).max(1000) }))
      .max(20)
      .parse(JSON.parse(String(formData.get("links") ?? "[]")));
    await pos.setMenuItemStock(await getDb(), actorOf(staff), recordId().parse(formData.get("id")), links);
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.menu_stock_failed");
  }
}

export async function closeMyDay(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.sell");
    await pos.closeDay(await getDb(), actorOf(staff), {
      countedCashKobo: naira.parse(formData.get("counted")),
      explanation: z.string().max(500).parse(String(formData.get("explanation") ?? "")) || null,
    });
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.close_failed");
  }
}

export async function signOffClosing(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.manage");
    await pos.verifyClosing(await getDb(), actorOf(staff), recordId().parse(formData.get("id")), z.string().max(300).parse(String(formData.get("note") ?? "")) || null);
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.verify_failed");
  }
}
