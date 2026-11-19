"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";

const roleSchema = z.enum(["owner", "general_manager", "front_desk"]);

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the person's full name").max(120),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  role: roleSchema,
});

/**
 * Owner invites a staff member. Creating an auth user needs the admin API, so
 * this is one of the few places the service-role client is used, strictly
 * after authorize("staff.manage") has confirmed the caller is the owner.
 */
export async function inviteStaff(_prev: ActionResult<{ email: string }> | null, formData: FormData): Promise<ActionResult<{ email: string }>> {
  try {
    await authorize("staff.manage");
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Check the details", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    const { fullName, email, role } = parsed.data;
    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    });
    if (error || !data.user) {
      if (error?.code === "email_exists") throw new AppError("CONFLICT", "Someone with this email already has an account.");
      throw new AppError("INTERNAL", "Could not send the invitation. Please try again.", { cause: error });
    }

    const { error: profileError } = await admin.from("staff_profiles").insert({ id: data.user.id, full_name: fullName, email, role });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new AppError("INTERNAL", "Could not create the staff profile.", { cause: profileError });
    }

    revalidatePath("/app/settings");
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
});

/**
 * Change role or access. Runs as the owner (not service role), so RLS and the
 * "keep an owner" trigger enforce the rules, and the audit trigger records it.
 */
export async function updateStaff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await authorize("staff.manage");
    const parsed = updateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid request");
    const { staffId, role, isActive } = parsed.data;
    if (staffId === me.id && !isActive) throw new AppError("VALIDATION", "You can't deactivate your own account.");

    const supabase = await createClient();
    const { data, error } = await supabase.from("staff_profiles").update({ role, is_active: isActive }).eq("id", staffId).select("id");
    if (error) {
      if (/active owner/.test(error.message)) throw new AppError("CONFLICT", "The hotel must always have at least one active owner.");
      throw new AppError("INTERNAL", "Could not update this staff member.", { cause: error });
    }
    if (!data?.length) throw new AppError("NOT_FOUND", "Staff member not found.");

    revalidatePath("/app/settings");
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("staff.update_failed", err);
    return toActionError(err);
  }
}
