import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { BookingRules } from "@/components/management/settings-forms";
import type { StaffRow } from "@/domain/views";
import { logger } from "@/lib/logger";
import { hotelToday } from "@/lib/hotel-date";
import { actorOf, authorizeRead } from "../auth";
import { all, first, getDb } from "../db";
import { managerToAsk, ROLE, type StaffRecord } from "../domain/admin";

export async function getBookingRules(): Promise<BookingRules> {
  await authorizeRead();
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
  await authorizeRead("staff.manage");
  const staff = await all<StaffRecord & { phone: string | null }>(
    await getDb(),
    `SELECT id, clerk_user_id, full_name, email, ${ROLE} AS role, is_active, phone, last_seen_at FROM staff_profiles ORDER BY is_active DESC, full_name`,
  );
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
    phone: s.phone ?? undefined,
    lastSignIn: s.clerk_user_id ? lastSignIn.get(s.clerk_user_id) : undefined,
    // Last time they used the app (recorded at most hourly), else their last sign-in.
    lastSeen: latest(s.last_seen_at ?? undefined, s.clerk_user_id ? lastSignIn.get(s.clerk_user_id) : undefined),
    invited: !s.clerk_user_id,
  }));
}


const latest = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

/** Front desk: which manager to ask for a manager-only action (name, role, phone). Signed-in staff only. */
export async function managerToAskForDesk() {
  const staff = await authorizeRead();
  return managerToAsk(await getDb(), actorOf(staff), hotelToday());
}
