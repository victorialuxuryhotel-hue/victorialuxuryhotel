"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { recordId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { first, getDb } from "./db";
import { reportPaymentIssue } from "./domain/payment-details";
import * as pos from "./domain/pos";

const outlet = z.enum(["restaurant", "bar"]);
const method = z.enum(["cash", "bank_transfer", "pos_terminal"], "Choose how the customer paid");
const lines = z.array(z.object({ menuItemId: recordId(), quantity: z.number().int().min(1).max(99), note: z.string().max(60).nullish() })).min(1, "Add at least one item").max(50);
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
      paymentReference: z.string().trim().max(80).parse(String(formData.get("paymentReference") ?? "")) || null,
      senderName: z.string().trim().max(80).parse(String(formData.get("senderName") ?? "")) || null,
      slipLast4: z.string().trim().max(4).parse(String(formData.get("slipLast4") ?? "")) || null,
      terminal: z.string().trim().max(40).parse(String(formData.get("terminal") ?? "")) || null,
      transferChecked: formData.get("transferChecked") === "on",
      duplicateOk: formData.get("duplicateOk") === "1",
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

export async function closeMyDay(_prev: ActionResult<pos.CloseResult> | null, formData: FormData): Promise<ActionResult<pos.CloseResult>> {
  try {
    const staff = await authorize("pos.sell");
    const r = await pos.closeDay(await getDb(), actorOf(staff), {
      countedCashKobo: naira.parse(formData.get("counted")),
      explanation: z.string().max(500).parse(String(formData.get("explanation") ?? "")) || null,
    });
    if (r.closed) refresh();
    return ok(r);
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

/**
 * POS declined but the customer was debited (section 2): the order is saved unpaid (as it stands) and a payment
 * issue is raised for the manager to check with the bank. Nothing is recorded as paid.
 */
export async function reportTillDebit(input: { id: string; outlet: string; lines: string; note: string; terminal?: string; slipLast4?: string }): Promise<ActionResult<{ number: number }>> {
  try {
    const staff = await authorize("pos.sell");
    const form = new FormData();
    form.set("lines", input.lines);
    const db = await getDb();
    const saved = await pos.saveOrder(db, actorOf(staff), {
      id: recordId().parse(input.id),
      outlet: outlet.parse(input.outlet),
      lines: parseLines(form),
      note: z.string().max(120).parse(input.note ?? ""),
    });
    const order = await first<{ total_kobo: number }>(db, "SELECT total_kobo FROM pos_orders WHERE id = ?", saved.id);
    await reportPaymentIssue(db, actorOf(staff), {
      sourceType: "pos_order",
      sourceId: saved.id,
      amountKobo: order?.total_kobo ?? 0,
      terminal: input.terminal ?? null,
      slipLast4: input.slipLast4 && /^\d{4}$/.test(input.slipLast4) ? input.slipLast4 : null,
      note: "Declined at the till but the customer says they were debited",
    });
    refresh();
    return ok({ number: saved.number });
  } catch (err) {
    return fail(err, "pos.debit_issue_failed");
  }
}
