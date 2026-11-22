"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, recordExpense, voidExpense } from "./domain/finance";

const schema = z.object({
  spentOn: z.iso.date("Choose a date"),
  category: z.enum(Object.keys(EXPENSE_CATEGORIES) as [keyof typeof EXPENSE_CATEGORIES], "Choose a category"),
  description: z.string().trim().min(2, "What was it for?").max(200),
  amount: z.coerce.number().positive("Enter an amount").max(1_000_000_000).transform((n) => Math.round(n * 100)),
  method: z.enum(Object.keys(EXPENSE_METHODS) as [keyof typeof EXPENSE_METHODS]),
  reference: z.string().trim().max(80).optional(),
});

export async function addExpense(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("expenses.manage");
    const v = schema.safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await recordExpense(await getDb(), actorOf(staff), { ...v.data, amountKobo: v.data.amount, reference: v.data.reference || null });
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("expense.add_failed", err);
    return toActionError(err);
  }
}

export async function cancelExpense(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("expenses.manage");
    await voidExpense(await getDb(), actorOf(staff), z.uuid().parse(formData.get("id")), String(formData.get("reason") ?? ""));
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
