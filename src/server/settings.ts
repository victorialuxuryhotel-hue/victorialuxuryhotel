"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "./auth";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, "Use a time like 14:00");

const schema = z.object({
  checkInTime: time,
  checkOutTime: time,
  websiteHoldMinutes: z.coerce.number().int().min(10, "At least 10 minutes").max(1440, "At most 24 hours"),
  staffHoldHours: z.coerce.number().int().min(1, "At least 1 hour").max(336, "At most 14 days"),
  cancellationPolicy: z.string().trim().max(2000).transform((v) => v || null),
});

export async function updateBookingRules(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await authorize("settings.manage");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Check the highlighted fields", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hotel_settings")
      .update({
        check_in_time: v.checkInTime,
        check_out_time: v.checkOutTime,
        website_hold_minutes: v.websiteHoldMinutes,
        staff_hold_hours: v.staffHoldHours,
        cancellation_policy: v.cancellationPolicy,
      })
      .eq("id", true)
      .select("id");
    if (error || !data?.length) throw new AppError("INTERNAL", "Could not save the booking rules.", { cause: error });
    refresh();
    return ok(undefined);
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("settings.update_failed", err);
    return toActionError(err);
  }
}
