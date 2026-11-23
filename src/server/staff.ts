"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { first, getDb } from "./db";
import { createStaffProfile, promoteToOwner, updateStaffProfile } from "./domain/admin";

const roleSchema = z.enum(["owner", "general_manager", "front_desk", "finance", "restaurant_bar"]);

const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{6,19}$/.test(v), "Enter a phone number, e.g. +234 803 123 4567")
  .optional();

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the person's full name").max(120),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  role: z.enum(["general_manager", "front_desk", "finance", "restaurant_bar"], "Choose a role"),
  phone: phoneSchema,
});

const clerkCode = (err: unknown) => (err as { errors?: Array<{ code?: string }> })?.errors?.[0]?.code;

export async function inviteStaff(_prev: ActionResult<{ email: string }> | null, formData: FormData): Promise<ActionResult<{ email: string }>> {
  try {
    const me = await authorize("staff.manage");
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Check the details", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    const { fullName, email, role, phone } = parsed.data;
    const db = await getDb();
    if (await first(db, "SELECT 1 FROM staff_profiles WHERE email = ?", email)) throw new AppError("CONFLICT", "Someone with this email already has an account.");

    const clerk = await clerkClient();
    let invitationId: string;
    try {
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/accept`,
        notify: true,
        ignoreExisting: true,
      });
      invitationId = invitation.id;
    } catch (err) {
      if (clerkCode(err) === "duplicate_record") throw new AppError("CONFLICT", "An invitation is already waiting for this email.");
      throw new AppError("INTERNAL", "Could not send the invitation. Please try again.", { cause: err });
    }

    try {
      await createStaffProfile(db, actorOf(me), { fullName, email, role, phone: phone || null });
    } catch (err) {
      await clerk.invitations.revokeInvitation(invitationId).catch((e: unknown) => logger.error("staff.invite_revoke_failed", e));
      throw err;
    }
    refresh();
    return ok({ email });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("staff.invite_failed", err);
    return toActionError(err);
  }
}

const updateSchema = z.object({
  staffId: z.uuid(),
  role: roleSchema,
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  phone: phoneSchema,
});

export async function updateStaff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await authorize("staff.manage");
    const parsed = updateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request");
    const { staffId, role, isActive, phone } = parsed.data;
    const record = await updateStaffProfile(await getDb(), actorOf(me), { staffId, role, isActive, phone: phone === undefined ? undefined : phone || null });

    if (record.clerk_user_id) {
      const clerk = await clerkClient();
      try {
        if (isActive) await clerk.users.unbanUser(record.clerk_user_id);
        else await clerk.users.banUser(record.clerk_user_id);
      } catch (err) {
        logger.error("staff.clerk_lock_failed", err, { staffId });
      }
    }
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("staff.update_failed", err);
    return toActionError(err);
  }
}

export async function makeOwner(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await authorize("staff.manage");
    const parsed = z.object({ staffId: z.uuid(), confirm: z.literal("yes") }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Confirm before making someone owner.");
    await promoteToOwner(await getDb(), actorOf(me), parsed.data.staffId);
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("staff.make_owner_failed", err);
    return toActionError(err);
  }
}
