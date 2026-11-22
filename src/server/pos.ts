"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import * as pos from "./domain/pos";

const outlet = z.enum(["restaurant", "bar"]);
const method = z.enum(["cash", "bank_transfer", "pos_terminal"]);
const fail = (err: unknown, event: string) => {
  if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(event, err);
  return toActionError(err);
};

export async function sell(_prev: ActionResult<{ number: number; totalKobo: number }> | null, formData: FormData): Promise<ActionResult<{ number: number; totalKobo: number }>> {
  try {
    const staff = await authorize("pos.sell");
    const items = z.array(z.object({ menuItemId: z.uuid(), quantity: z.number().int().min(1).max(99) })).max(50).parse(JSON.parse(String(formData.get("items") ?? "[]")));
    const pay = String(formData.get("pay") ?? "");
    const room = pay === "room" ? z.uuid("Choose the guest's room").parse(formData.get("reservationId")) : undefined;
    const r = await pos.recordSale(await getDb(), actorOf(staff), {
      outlet: outlet.parse(formData.get("outlet")),
      items,
      ...(room ? { reservationId: room } : { method: method.parse(pay) }),
    });
    refresh();
    return ok({ number: r.number, totalKobo: r.totalKobo });
  } catch (err) {
    if (err instanceof z.ZodError) return toActionError(new AppError("VALIDATION", err.issues[0]?.message ?? "Check the sale"));
    return fail(err, "pos.sell_failed");
  }
}

export async function settleCharges(_prev: ActionResult<{ kobo: number }> | null, formData: FormData): Promise<ActionResult<{ kobo: number }>> {
  try {
    const staff = await authorize("pos.settle");
    const kobo = await pos.settleRoomCharges(await getDb(), actorOf(staff), z.uuid().parse(formData.get("reservationId")), method.parse(formData.get("method")));
    refresh();
    return ok({ kobo });
  } catch (err) {
    return fail(err, "pos.settle_failed");
  }
}

export async function voidSale(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.manage");
    await pos.voidSale(await getDb(), actorOf(staff), z.uuid().parse(formData.get("id")), String(formData.get("reason") ?? ""));
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.void_failed");
  }
}

export async function addMenuItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("pos.manage");
    const v = z
      .object({
        name: z.string().trim().min(2, "Enter a name").max(80),
        outlet,
        price: z.coerce.number().positive("Enter a price").max(10_000_000).transform((n) => Math.round(n * 100)),
      })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await pos.addMenuItem(await getDb(), actorOf(staff), { name: v.data.name, outlet: v.data.outlet, priceKobo: v.data.price });
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "pos.menu_failed");
  }
}

export async function toggleMenuItem(formData: FormData): Promise<void> {
  const staff = await authorize("pos.manage");
  await pos.setMenuItem(await getDb(), actorOf(staff), z.uuid().parse(formData.get("id")), { active: formData.get("active") === "1" });
  refresh();
}
