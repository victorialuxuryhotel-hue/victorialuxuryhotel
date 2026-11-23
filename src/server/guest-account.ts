"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { GUEST_SESSION_DAYS, signGuest, verifyGuest } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { getDb } from "./db";
import { checkGuestCode, guestCancel, guestChangeDates, issueGuestCode } from "./domain/guest-account";
import { guestCodeEmail } from "./email/templates";
import { sendEmail } from "./email/send";
import { enforceRateLimit, enforceSubjectLimit } from "./rate-limit";

const COOKIE = "vl_guest";
const secret = () => process.env.GUEST_SESSION_SECRET ?? process.env.VIEW_AS_SECRET ?? "";
const email = z.email("Enter the email you booked with").max(254).transform((e) => e.trim().toLowerCase());

export async function guestEmail(): Promise<string | null> {
  return verifyGuest(secret(), (await cookies()).get(COOKIE)?.value);
}

async function requireGuest(): Promise<string> {
  const e = await guestEmail();
  if (!e) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return e;
}

export async function requestGuestCode(_prev: ActionResult<{ email: string }> | null, formData: FormData): Promise<ActionResult<{ email: string }>> {
  try {
    const e = email.parse(formData.get("email"));
    await enforceRateLimit("guest_code", 5, 3600);
    await enforceSubjectLimit("guest_code", e, 3, 3600);
    const code = await issueGuestCode(await getDb(), e);
    if (code) {
      if (process.env.NODE_ENV !== "production") logger.info("guest.code_dev", { code });
      await sendEmail({ to: e, ...guestCodeEmail(code, publicEnv().NEXT_PUBLIC_SITE_URL) });
    }
    return ok({ email: e });
  } catch (err) {
    if (err instanceof z.ZodError) return toActionError(new AppError("VALIDATION", err.issues[0]?.message ?? "Enter your email"));
    return toActionError(err);
  }
}

export async function verifyGuestCode(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const e = email.parse(formData.get("email"));
    const code = z.string().regex(/^\d{6}$/, "Enter the 6-digit code").parse(String(formData.get("code") ?? "").trim());
    await enforceRateLimit("guest_verify", 20, 3600);
    await enforceSubjectLimit("guest_verify", e, 10, 3600);
    if (!(await checkGuestCode(await getDb(), e, code))) throw new AppError("VALIDATION", "That code isn't right or has expired. Check the latest email, or send a new code.");
    (await cookies()).set(COOKIE, await signGuest(secret(), e), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GUEST_SESSION_DAYS * 86_400,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return toActionError(new AppError("VALIDATION", err.issues[0]?.message ?? "Check the code"));
    return toActionError(err);
  }
  redirect("/account");
}

export async function signOutGuest(): Promise<void> {
  (await cookies()).delete(COOKIE);
  redirect("/account");
}

export async function cancelMyBooking(_prev: ActionResult<{ refundKobo: number }> | null, formData: FormData): Promise<ActionResult<{ refundKobo: number }>> {
  try {
    const e = await requireGuest();
    const r = await guestCancel(await getDb(), e, z.uuid().parse(formData.get("id")));
    refresh();
    return ok({ refundKobo: r.refundKobo });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error("guest.cancel_failed", err);
    return toActionError(err);
  }
}

export async function changeMyDates(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const e = await requireGuest();
    await guestChangeDates(await getDb(), e, z.uuid().parse(formData.get("id")), String(formData.get("checkIn") ?? ""), String(formData.get("checkOut") ?? ""));
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error("guest.change_failed", err);
    return toActionError(err);
  }
}
