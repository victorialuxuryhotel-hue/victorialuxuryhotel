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
  await authorizeRead(["reservations.manage", "payments.record", "reports.view", "settings.manage"]);
  const data = await first<{
    check_in_time: string; check_out_time: string; website_hold_minutes: number; staff_hold_hours: number; cancellation_policy: string | null;
    free_cancel_hours: number; late_cancel_fee_pct: number; vat_rate_bp: number;
  }>(
    await getDb(),
    `SELECT check_in_time, check_out_time, website_hold_minutes, staff_hold_hours, cancellation_policy,
            free_cancel_hours, late_cancel_fee_pct, vat_rate_bp FROM hotel_settings WHERE id = 1`,
  );
  if (!data) throw new Error("Could not load hotel settings");
  return {
    checkInTime: data.check_in_time,
    checkOutTime: data.check_out_time,
    websiteHoldMinutes: data.website_hold_minutes,
    staffHoldHours: data.staff_hold_hours,
    cancellationPolicy: data.cancellation_policy,
    freeCancelHours: data.free_cancel_hours,
    lateCancelFeePct: data.late_cancel_fee_pct,
    vatRateBp: data.vat_rate_bp,
  };
}

export async function getCatalogueSettings() {
  await authorizeRead("settings.manage");
  const db = await getDb();
  const [extras, promos] = await Promise.all([
    all<{ id: string; name: string; price_kobo: number; per_night: number; is_active: number }>(db, "SELECT id, name, price_kobo, per_night, is_active FROM extras ORDER BY is_active DESC, sort_order, name"),
    all<{ id: string; code: string; percent_off: number; valid_until: string | null; max_uses: number | null; used_count: number; is_active: number }>(
      db,
      "SELECT id, code, percent_off, valid_until, max_uses, used_count, is_active FROM promo_codes ORDER BY is_active DESC, created_at DESC",
    ),
  ]);
  return { extras, promos };
}

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
    lastSeen: latest(s.last_seen_at ?? undefined, s.clerk_user_id ? lastSignIn.get(s.clerk_user_id) : undefined),
    invited: !s.clerk_user_id,
  }));
}

const latest = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

export async function managerToAskForDesk() {
  const staff = await authorizeRead(["reservations.manage", "payments.record", "reports.view"]);
  return managerToAsk(await getDb(), actorOf(staff), hotelToday());
}
