"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { actorOf, authorize } from "./auth";
import { getDb } from "./db";
import { createHallBooking, recordHallPayment, setHallStatus } from "./domain/events";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:00");
const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null);

export async function addHallBooking(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("events.manage");
    const v = z
      .object({
        title: z.string().trim().min(2, "e.g. Staff training").max(120),
        customerName: z.string().trim().min(2, "Who's booking?").max(120),
        phone: opt(30),
        email: z.union([z.literal(""), z.email("Enter a valid email")]).transform((e) => e || null),
        eventDate: z.iso.date("Choose a date"),
        startTime: time,
        endTime: time,
        guests: z.union([z.literal(""), z.coerce.number().int().positive()]).transform((n) => (n === "" ? null : n)),
        price: z.union([z.literal(""), z.coerce.number().min(0)]).transform((n) => (n === "" ? 0 : Math.round(n * 100))),
        status: z.enum(["enquiry", "confirmed"]),
        notes: opt(1000),
      })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(v.error).fieldErrors });
    await createHallBooking(await getDb(), actorOf(staff), { ...v.data, priceKobo: v.data.price });
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function changeHallStatus(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("events.manage");
    await setHallStatus(await getDb(), actorOf(staff), z.uuid().parse(formData.get("id")), z.enum(["confirmed", "cancelled"]).parse(formData.get("status")));
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function addHallPayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const staff = await authorize("events.manage");
    const v = z
      .object({
        bookingId: z.uuid(),
        amount: z.coerce.number().positive("Enter an amount").transform((n) => Math.round(n * 100)),
        method: z.enum(["cash", "bank_transfer", "pos_terminal", "card"]),
        paidOn: z.iso.date(),
        reference: opt(80),
      })
      .safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", v.error.issues[0]?.message ?? "Check the payment");
    await recordHallPayment(await getDb(), actorOf(staff), { ...v.data, amountKobo: v.data.amount });
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
