"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordId } from "@/lib/ids";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { cancelBill, createBill, payBill } from "./domain/bills";

const fail = (err: unknown, event: string) => {
  if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(event, err);
  return toActionError(err);
};

export async function newBill(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let target: string;
  try {
    const staff = await authorize("bills.manage");
    const v = z
      .object({ companyName: z.string().max(120), attention: z.string().max(120).optional(), validUntil: z.string().max(10) })
      .parse(Object.fromEntries(formData));
    const ids = formData.getAll("reservationIds").map((x) => recordId().parse(String(x)));
    const b = await createBill(await getDb(), actorOf(staff), { ...v, reservationIds: ids });
    refresh();
    target = `/app/bills/${b.id}`;
  } catch (err) {
    return fail(err, "bill.create_failed");
  }
  redirect(target);
}

export async function cancelBillAction(id: string): Promise<ActionResult> {
  try {
    const staff = await authorize("bills.manage");
    await cancelBill(await getDb(), actorOf(staff), recordId().parse(id));
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "bill.cancel_failed");
  }
}

const paySchema = z.object({
  billId: recordId(),
  amountKobo: z.number().int().positive(),
  method: z.enum(["cash", "bank_transfer", "pos_terminal"]),
  reference: z.string().max(80).nullish(),
  senderName: z.string().max(80).nullish(),
  slipLast4: z.string().max(4).nullish(),
  terminal: z.string().max(40).nullish(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmReceived: z.boolean(),
  duplicateOk: z.boolean().optional(),
});

export async function payBillAction(input: z.input<typeof paySchema>): Promise<ActionResult<{ receipts: { reference: string; receiptNumber: string; amountKobo: number }[] }>> {
  try {
    const staff = await authorize("payments.record");
    const v = paySchema.parse(input);
    const r = await payBill(await getDb(), actorOf(staff), v.billId, v);
    refresh();
    return ok(r);
  } catch (err) {
    return fail(err, "bill.pay_failed");
  }
}
