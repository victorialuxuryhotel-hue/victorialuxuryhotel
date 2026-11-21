import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { StaffRole } from "@/domain/status";
import { can, type Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { first, getDb, type Actor } from "./db";
import { linkClerkUser, type StaffRecord } from "./domain/admin";

export type Staff = { id: string; fullName: string; email: string; role: StaffRole };

/**
 * The signed-in, ACTIVE staff member for this request, or null.
 *
 * Identity comes from Clerk (who you are); access comes from our database
 * (whether you are active staff, and your role). A deactivated account loses
 * access immediately, even with a valid Clerk session. The first time an
 * invited person signs in, their Clerk account is linked to the staff record
 * with the same verified email. Cached per request.
 */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  // Always per-request: never let a staff lookup be prerendered.
  await connection();
  const { userId } = await auth();
  if (!userId) return null;

  const db = await getDb();
  let record = await first<StaffRecord>(db, "SELECT id, clerk_user_id, full_name, email, role, is_active FROM staff_profiles WHERE clerk_user_id = ?", userId);
  if (!record) {
    const user = await currentUser();
    const email = user?.primaryEmailAddress;
    if (!email || email.verification?.status !== "verified") return null;
    record = await linkClerkUser(db, userId, email.emailAddress);
    if (record) logger.info("auth.staff_linked", { staffId: record.id });
  }
  if (!record || !record.is_active) return null;
  return { id: record.id, fullName: record.full_name, email: record.email, role: record.role };
});

/** For pages and layouts: redirects to sign-in when there is no active staff session. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?denied=1");
  return staff;
}

/** For server actions, route handlers and staff queries: throws instead of redirecting. */
export async function authorize(permission?: Permission): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (permission && !can(staff.role, permission)) {
    throw new AppError("FORBIDDEN", "Your role does not allow this action.");
  }
  return staff;
}

/** The staff member as the data layer's actor (domain functions re-check the role). */
export const actorOf = (staff: Staff): Actor => ({ id: staff.id, role: staff.role });
