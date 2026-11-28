"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { recordId } from "@/lib/ids";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { decideChange, decideOwing, decideRefund } from "./domain/approvals";

const schema = z.object({
  kind: z.enum(["refund", "no_show", "unpaid_change", "leave_owing"]),
  id: recordId(),
  approve: z.boolean(),
  note: z.string().max(500),
  amountKobo: z.number().int().positive().max(10_000_000_000).optional(),
  method: z.enum(["bank_transfer", "cash"]).optional(),
});

/** Approve or decline one item in Approvals (X10). */
export async function decide(input: z.input<typeof schema>): Promise<ActionResult<{ receiptNumber: string | null }>> {
  try {
    const staff = await authorize("payments.approve");
    const v = schema.parse(input);
    const db = await getDb();
    const actor = actorOf(staff);
    let receiptNumber: string | null = null;
    if (v.kind === "refund" || v.kind === "no_show") receiptNumber = (await decideRefund(db, actor, { id: v.id, approve: v.approve, amountKobo: v.amountKobo, method: v.method, note: v.note })).receiptNumber;
    else if (v.kind === "unpaid_change") await decideChange(db, actor, { id: v.id, approve: v.approve, note: v.note });
    else await decideOwing(db, actor, { reservationId: v.id, approve: v.approve, note: v.note });
    refresh();
    return ok({ receiptNumber });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("approvals.decide_failed", err);
    return toActionError(err);
  }
}
