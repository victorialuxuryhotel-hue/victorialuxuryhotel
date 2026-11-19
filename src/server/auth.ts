import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { StaffRole } from "@/domain/status";
import { can, type Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type Staff = { id: string; fullName: string; email: string; role: StaffRole };

/**
 * The signed-in, ACTIVE staff member for this request, or null.
 * getClaims() verifies the JWT signature; the profile lookup confirms the user
 * is still active staff (a deactivated account loses access immediately, even
 * with a valid session). Cached per request.
 */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  // Always per-request: never let a staff lookup be prerendered.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return { id: profile.id, fullName: profile.full_name, email: profile.email, role: profile.role };
});

/** For pages and layouts: redirects to sign-in when there is no active staff session. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function authorize(permission?: Permission): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (permission && !can(staff.role, permission)) {
    throw new AppError("FORBIDDEN", "Your role does not allow this action.");
  }
  return staff;
}
