"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorOf, authorize } from "./auth";
import { activity, first, getDb, writeBatch } from "./db";
import { createStaffProfile, promoteToOwner, updateStaffProfile } from "./domain/admin";

const roleSchema = z.enum(["owner", "general_manager", "hotel_manager", "front_desk", "finance", "restaurant_bar", "restaurant_bar_manager"]);

const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{6,19}$/.test(v), "Enter a phone number, e.g. +234 803 123 4567")
  .optional();

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the person's full name").max(120),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  role: z.enum(["general_manager", "hotel_manager", "front_desk", "finance", "restaurant_bar", "restaurant_bar_manager"], "Choose a role"),
  phone: phoneSchema,
});

const clerkCode = (err: unknown) => (err as { errors?: Array<{ code?: string }> })?.errors?.[0]?.code;

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

async function revokePendingInvitations(clerk: Clerk, email: string): Promise<void> {
  const { data } = await clerk.invitations.getInvitationList({ status: "pending", query: email });
  await Promise.all(data.filter((i) => i.emailAddress.toLowerCase() === email).map((i) => clerk.invitations.revokeInvitation(i.id)));
}

const sendInvitation = (clerk: Clerk, email: string) =>
  clerk.invitations.createInvitation({ emailAddress: email, redirectUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/accept`, notify: true, ignoreExisting: true });

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
      invitationId = (await sendInvitation(clerk, email)).id;
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

    const clerk = await clerkClient();
    try {
      if (record.clerk_user_id) {
        if (isActive) await clerk.users.unbanUser(record.clerk_user_id);
        else await clerk.users.banUser(record.clerk_user_id);
      } else if (!isActive) {
        await revokePendingInvitations(clerk, record.email);
      }
    } catch (err) {
      logger.error("staff.clerk_lock_failed", err, { staffId });
    }
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("staff.update_failed", err);
    return toActionError(err);
  }
}

export async function resendInvite(_prev: ActionResult<{ email: string }> | null, formData: FormData): Promise<ActionResult<{ email: string }>> {
  try {
    const me = await authorize("staff.manage");
    const staffId = z.uuid().parse(formData.get("staffId"));
    const db = await getDb();
    const s = await first<{ email: string; is_active: number; clerk_user_id: string | null }>(db, "SELECT email, is_active, clerk_user_id FROM staff_profiles WHERE id = ?", staffId);
    if (!s) throw new AppError("NOT_FOUND", "Staff member not found.");
    if (s.clerk_user_id) throw new AppError("CONFLICT", "They have already signed in.");
    if (!s.is_active) throw new AppError("CONFLICT", "Restore their access first.");
    const clerk = await clerkClient();
    try {
      await revokePendingInvitations(clerk, s.email);
      await sendInvitation(clerk, s.email);
    } catch (err) {
      throw new AppError("INTERNAL", "Could not send the invitation. Please try again.", { cause: err });
    }
    await writeBatch(db, actorOf(me), [activity(db, "staff.invite_resent", "staff_profile", staffId, `Invitation sent again to ${s.email}`)]);
    return ok({ email: s.email });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("staff.invite_resend_failed", err);
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
