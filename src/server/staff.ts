"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { first, getDb } from "./db";
import { createStaffProfile, updateStaffProfile } from "./domain/admin";

const roleSchema = z.enum(["owner", "general_manager", "front_desk"]);

/** Optional staff phone (shown only to signed-in staff, e.g. "ask a manager"). */
const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{6,19}$/.test(v), "Enter a phone number, e.g. +234 803 123 4567")
  .optional();

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the person's full name").max(120),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  role: roleSchema,
  phone: phoneSchema,
});

/** Clerk errors carry codes; anything else is unexpected. */
const clerkCode = (err: unknown) => (err as { errors?: Array<{ code?: string }> })?.errors?.[0]?.code;

/**
 * Owner invites a staff member: Clerk emails an invitation link to
 * /auth/accept, and the staff record (role, access) is created here. The
 * person's Clerk account is linked to this record by email on first sign-in.
 * If the record can't be created, the invitation is revoked.
 */
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

/**
 * Change role or access. The database keeps at least one active owner and
 * audits the change. Deactivation takes effect on the person's next request
 * (every request re-checks the record); their Clerk account is also locked so
 * they can't sign in again.
 */
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
        // Access is already removed by the database record; log so the lock can be retried.
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
