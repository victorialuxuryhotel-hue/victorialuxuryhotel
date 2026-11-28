"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { recordId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { actorOf, authorize, authorizeRead } from "./auth";
import { getDb } from "./db";
import * as desk from "./domain/front-desk";

const fail = (err: unknown, event: string) => {
  if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error(event, err);
  return toActionError(err);
};

const cardSchema = z.object({
  idType: z.string().max(20),
  // The screen sends only the last 4 characters; anything longer is cut to 4 here before it goes anywhere.
  idLast4: z.string().max(40).transform(desk.last4),
  address: z.string().max(200),
  comingFrom: z.string().max(80),
  nationality: z.string().max(60),
  purpose: z.string().max(20),
  rulesAccepted: z.boolean(),
});

/** The card for this stay, or the guest's last one to confirm (X2). */
export async function loadRegistration(reservationId: string): Promise<desk.SavedRegistration & { fromEarlierStay: boolean } | null> {
  try {
    const staff = await authorizeRead("reservations.manage");
    const r = await desk.registrationFor(await getDb(), actorOf(staff), recordId().parse(reservationId));
    return r.card ? { ...r.card, fromEarlierStay: r.fromEarlierStay } : null;
  } catch {
    return null;
  }
}

export async function checkInGuest(input: { reservationId: string; card: z.input<typeof cardSchema> }): Promise<ActionResult<{ undoId: number | null }>> {
  try {
    const staff = await authorize("reservations.manage");
    const v = z.object({ reservationId: recordId(), card: cardSchema }).parse(input);
    const r = await desk.checkInWithCard(await getDb(), actorOf(staff), v.reservationId, v.card);
    refresh();
    return ok(r);
  } catch (err) {
    return fail(err, "desk.check_in_failed");
  }
}

export async function checkOutInfo(reservationId: string): Promise<ActionResult<desk.CheckOutSummary>> {
  try {
    const staff = await authorizeRead("reservations.manage");
    return ok(await desk.checkOutSummary(await getDb(), actorOf(staff), recordId().parse(reservationId)));
  } catch (err) {
    return fail(err, "desk.check_out_info_failed");
  }
}

export async function checkOutGuest(input: { reservationId: string; keyReturned: boolean; leaveOwingReason?: string }): Promise<ActionResult<{ balance: number; undoId: number | null }>> {
  try {
    const staff = await authorize("reservations.manage");
    const v = z.object({ reservationId: recordId(), keyReturned: z.boolean(), leaveOwingReason: z.string().max(300).optional() }).parse(input);
    const r = await desk.checkOutGuest(await getDb(), actorOf(staff), v.reservationId, { keyReturned: v.keyReturned, leaveOwingReason: v.leaveOwingReason ?? null });
    refresh();
    return ok(r);
  } catch (err) {
    return fail(err, "desk.check_out_failed");
  }
}

export async function askForRefund(input: { reservationId: string; amountKobo: number; method: "bank_transfer" | "cash"; reason: string }): Promise<ActionResult> {
  try {
    const staff = await authorize("refunds.request");
    const v = z.object({ reservationId: recordId(), amountKobo: z.number().int().positive().max(10_000_000_000), method: z.enum(["bank_transfer", "cash"]), reason: z.string().max(500) }).parse(input);
    await desk.requestRefund(await getDb(), actorOf(staff), v);
    refresh();
    return ok(undefined);
  } catch (err) {
    return fail(err, "desk.refund_request_failed");
  }
}

const walkInSchema = z.object({
  requestId: recordId(),
  guestId: recordId().nullish(),
  fullName: z.string().max(120),
  phone: z.string().max(30),
  nights: z.number().int(),
  guests: z.number().int(),
  categoryId: recordId(),
  roomId: recordId().nullish(),
  payment: z
    .object({
      method: z.enum(["cash", "bank_transfer", "pos_terminal"]),
      reference: z.string().max(80).nullish(),
      senderName: z.string().max(80).nullish(),
      slipLast4: z.string().max(4).nullish(),
      terminal: z.string().max(40).nullish(),
      confirmReceived: z.boolean(),
      duplicateOk: z.boolean().optional(),
    })
    .nullish(),
  card: cardSchema.nullish(),
});

/** Walk-in (X1): pay and check in, or save without paying. */
export async function walkInGuest(input: z.input<typeof walkInSchema>): Promise<ActionResult<{ id: string; reference: string; receiptNumber: string | null; checkedIn: boolean }>> {
  try {
    const staff = await authorize("reservations.manage");
    const v = walkInSchema.parse(input);
    const r = await desk.walkIn(await getDb(), actorOf(staff), v);
    refresh();
    return ok(r);
  } catch (err) {
    return fail(err, "desk.walk_in_failed");
  }
}
