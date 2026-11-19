"use server";

import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";

const schema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match", path: ["confirm"] });

/** Set or change the signed-in staff member's own password (also completes an invite). */
export async function setPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await authorize();
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      if (error.code === "same_password") throw new AppError("VALIDATION", "Choose a password different from your current one.");
      if (error.code === "weak_password") throw new AppError("VALIDATION", "That password is too weak. Try a longer one.");
      throw new AppError("INTERNAL", "Could not update your password.", { cause: error });
    }
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("account.password_failed", err);
    return toActionError(err);
  }
}
