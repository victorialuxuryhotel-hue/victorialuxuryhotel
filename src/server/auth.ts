import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { StaffRole } from "@/domain/status";
import { can, type Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifyViewAs } from "@/lib/auth/view-as-token";
import { first, getDb, VIEW_AS_READ_ONLY, type Actor } from "./db";
import { LAST_SEEN_EVERY_MS, linkClerkUser, touchLastSeen, type StaffRecord } from "./domain/admin";

/**
 * `viewAs` is true while an owner views the app as front desk: `role` is then
 * front_desk (menus, pages and permissions follow it) and every write refuses.
 */
export type Staff = { id: string; fullName: string; email: string; role: StaffRole; viewAs?: boolean };

export const VIEW_AS_COOKIE = "vl_view_as";

/** The view-as cookie counts only for this active owner, in this Clerk session, before it expires. */
async function viewingAsFrontDesk(staffId: string, sessionId: string | null): Promise<boolean> {
  const secret = process.env.VIEW_AS_SECRET ?? "";
  const token = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!token || !sessionId) return false;
  const claims = await verifyViewAs(secret, token);
  return claims?.staffId === staffId && claims.sessionId === sessionId;
}

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
  const { userId, sessionId } = await auth();
  if (!userId) return null;

  const db = await getDb();
  let record = await first<StaffRecord>(
    db,
    "SELECT id, clerk_user_id, full_name, email, role, is_active, last_seen_at FROM staff_profiles WHERE clerk_user_id = ?",
    userId,
  );
  if (!record) {
    const user = await currentUser();
    const email = user?.primaryEmailAddress;
    if (!email || email.verification?.status !== "verified") return null;
    record = await linkClerkUser(db, userId, email.emailAddress);
    if (record) logger.info("auth.staff_linked", { staffId: record.id });
  }
  if (!record || !record.is_active) return null;
  // "Last active", at most once an hour (used to pick which manager front desk asks).
  if (!record.last_seen_at || Date.now() - Date.parse(record.last_seen_at) > LAST_SEEN_EVERY_MS) {
    await touchLastSeen(db, record.id).catch((err: unknown) => logger.warn("auth.last_seen_failed", { error: err instanceof Error ? err.message : "error" }));
  }
  if (record.role === "owner" && (await viewingAsFrontDesk(record.id, sessionId ?? null))) {
    return { id: record.id, fullName: record.full_name, email: record.email, role: "front_desk", viewAs: true };
  }
  return { id: record.id, fullName: record.full_name, email: record.email, role: record.role };
});

/** For pages and layouts: redirects to sign-in when there is no active staff session. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?denied=1");
  return staff;
}

/**
 * For server actions and route handlers that change something: throws instead
 * of redirecting. Refuses while viewing as front desk (fail-safe: anything that
 * hasn't declared itself a read is treated as a write). Reads use authorizeRead.
 */
export async function authorize(permission?: Permission): Promise<Staff> {
  const staff = await authorizeRead(permission);
  if (staff.viewAs) throw new AppError("FORBIDDEN", VIEW_AS_READ_ONLY);
  return staff;
}

/** For staff queries that only read. Allowed while viewing as front desk, with front-desk permissions. */
export async function authorizeRead(permission?: Permission): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (permission && !can(staff.role, permission)) {
    throw new AppError("FORBIDDEN", "Your role does not allow this action.");
  }
  return staff;
}

/** The staff member as the data layer's actor (domain functions re-check the role; writes refuse when read-only). */
export const actorOf = (staff: Staff): Actor => ({ id: staff.id, role: staff.role, ...(staff.viewAs ? { readOnly: true } : {}) });
