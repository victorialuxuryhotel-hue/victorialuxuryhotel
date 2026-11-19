import "server-only";
import type { BookingRules } from "@/components/management/settings-forms";
import type { ActivityRow, StaffRow } from "@/domain/views";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** All reads run as the signed-in staff member, so RLS decides what comes back. */

export async function getBookingRules(): Promise<BookingRules> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hotel_settings").select("*").single();
  if (error || !data) throw new Error("Could not load hotel settings", { cause: error });
  return {
    checkInTime: data.check_in_time,
    checkOutTime: data.check_out_time,
    websiteHoldMinutes: data.website_hold_minutes,
    staffHoldHours: data.staff_hold_hours,
    cancellationPolicy: data.cancellation_policy,
  };
}

/** Owner only (the caller checks). Last sign-in comes from Supabase Auth. */
export async function listStaff(): Promise<StaffRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff_profiles").select("id, full_name, email, role, is_active").order("full_name");
  if (error) throw new Error("Could not load staff", { cause: error });
  const { data: users } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
  const lastSignIn = new Map((users?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? undefined]));
  return data.map((s) => ({ id: s.id, name: s.full_name, email: s.email, role: s.role, isActive: s.is_active, lastSignIn: lastSignIn.get(s.id) }));
}

export async function recentActivity(limit = 50): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, created_at, action, summary, actor_type, actor:staff_profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Could not load activity", { cause: error });
  return data.map((a) => ({
    id: String(a.id),
    at: a.created_at,
    action: a.action,
    summary: a.summary,
    actor: a.actor?.full_name ?? (a.actor_type === "system" ? "System" : "Staff"),
  }));
}
