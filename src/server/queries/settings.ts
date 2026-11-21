import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { BookingRules } from "@/components/management/settings-forms";
import type { ActivityRow, StaffRow } from "@/domain/views";
import { logger } from "@/lib/logger";
import { authorize } from "../auth";
import { all, first, getDb } from "../db";
import type { StaffRecord } from "../domain/admin";

export async function getBookingRules(): Promise<BookingRules> {
  await authorize();
  const data = await first<{ check_in_time: string; check_out_time: string; website_hold_minutes: number; staff_hold_hours: number; cancellation_policy: string | null }>(
    await getDb(),
    "SELECT check_in_time, check_out_time, website_hold_minutes, staff_hold_hours, cancellation_policy FROM hotel_settings WHERE id = 1",
  );
  if (!data) throw new Error("Could not load hotel settings");
  return {
    checkInTime: data.check_in_time,
    checkOutTime: data.check_out_time,
    websiteHoldMinutes: data.website_hold_minutes,
    staffHoldHours: data.staff_hold_hours,
    cancellationPolicy: data.cancellation_policy,
  };
}

/** Owner only. Last sign-in comes from Clerk (best effort: the list still shows if Clerk is unreachable). */
export async function listStaff(): Promise<StaffRow[]> {
  await authorize("staff.manage");
  const staff = await all<StaffRecord>(await getDb(), "SELECT id, clerk_user_id, full_name, email, role, is_active FROM staff_profiles ORDER BY full_name");
  const linked = staff.map((s) => s.clerk_user_id).filter((id): id is string => Boolean(id));
  const lastSignIn = new Map<string, string | undefined>();
  if (linked.length) {
    try {
      const { data } = await (await clerkClient()).users.getUserList({ userId: linked, limit: 200 });
      for (const u of data) lastSignIn.set(u.id, u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : undefined);
    } catch (err) {
      logger.warn("staff.last_sign_in_unavailable", { error: err instanceof Error ? err.message : "error" });
    }
  }
  return staff.map((s) => ({
    id: s.id,
    name: s.full_name,
    email: s.email,
    role: s.role,
    isActive: s.is_active === 1,
    lastSignIn: s.clerk_user_id ? lastSignIn.get(s.clerk_user_id) : undefined,
  }));
}

/** Managers only. */
export async function recentActivity(limit = 50): Promise<ActivityRow[]> {
  await authorize("activity.view");
  const rows = await all<{ id: number; created_at: string; action: string; summary: string; actor_type: string; actor: string | null }>(
    await getDb(),
    `SELECT a.id, a.created_at, a.action, a.summary, a.actor_type, s.full_name AS actor
     FROM activity_log a LEFT JOIN staff_profiles s ON s.id = a.actor_id
     ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    limit,
  );
  return rows.map((a) => ({
    id: String(a.id),
    at: a.created_at,
    action: a.action,
    summary: a.summary,
    actor: a.actor ?? (a.actor_type === "system" ? "System" : "Staff"),
  }));
}
