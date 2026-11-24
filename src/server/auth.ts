import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { StaffRole } from "@/domain/status";
import { canAny, type Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { TWO_STEP_ROLES, twoStepOptional, twoStepState, type TwoStepState } from "@/lib/auth/two-step";
import { verifyViewAs } from "@/lib/auth/view-as-token";
import { first, getDb, VIEW_AS_READ_ONLY, type Actor } from "./db";
import { LAST_SEEN_EVERY_MS, linkClerkUser, ROLE, touchLastSeen, type StaffRecord } from "./domain/admin";

export type Staff = { id: string; fullName: string; email: string; role: StaffRole; viewAs?: boolean; twoStep?: TwoStepState };

async function currentTwoStep(role: StaffRole, secondFactorAge: number | undefined, claims: Record<string, unknown> | null): Promise<TwoStepState | undefined> {
  if (!TWO_STEP_ROLES.includes(role) || twoStepOptional(process.env.TWO_STEP_OPTIONAL, process.env.NEXT_PUBLIC_SITE_URL)) return undefined;
  const totp = typeof claims?.totp === "boolean" ? claims.totp : Boolean((await currentUser())?.totpEnabled);
  return twoStepState(role, totp, secondFactorAge);
}

export const VIEW_AS_COOKIE = "vl_view_as";

async function viewingAsFrontDesk(staffId: string, sessionId: string | null): Promise<boolean> {
  const secret = process.env.VIEW_AS_SECRET ?? "";
  const token = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!token || !sessionId) return false;
  const claims = await verifyViewAs(secret, token);
  return claims?.staffId === staffId && claims.sessionId === sessionId;
}

export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  await connection();
  const { userId, sessionId, factorVerificationAge, sessionClaims } = await auth();
  if (!userId) return null;

  const db = await getDb();
  let record = await first<StaffRecord>(
    db,
    `SELECT id, clerk_user_id, full_name, email, ${ROLE} AS role, is_active, last_seen_at FROM staff_profiles WHERE clerk_user_id = ?`,
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
  if (!record.last_seen_at || Date.now() - Date.parse(record.last_seen_at) > LAST_SEEN_EVERY_MS) {
    await touchLastSeen(db, record.id).catch((err: unknown) => logger.warn("auth.last_seen_failed", { error: err instanceof Error ? err.message : "error" }));
  }
  const twoStep = await currentTwoStep(record.role, factorVerificationAge?.[1], sessionClaims as Record<string, unknown> | null);
  if (twoStep) return { id: record.id, fullName: record.full_name, email: record.email, role: record.role, twoStep };
  if (record.role === "owner" && (await viewingAsFrontDesk(record.id, sessionId ?? null))) {
    return { id: record.id, fullName: record.full_name, email: record.email, role: "front_desk", viewAs: true };
  }
  return { id: record.id, fullName: record.full_name, email: record.email, role: record.role };
});

export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?denied=1");
  if (staff.twoStep) redirect("/two-step/security");
  return staff;
}

export async function authorize(permission?: Permission): Promise<Staff> {
  const staff = await authorizeRead(permission);
  if (staff.viewAs) throw new AppError("FORBIDDEN", VIEW_AS_READ_ONLY);
  return staff;
}

export async function authorizeRead(permission?: Permission | readonly Permission[]): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (staff.twoStep) throw new AppError("FORBIDDEN", "Set up two-step sign-in first.");
  if (permission && !canAny(staff.role, permission)) {
    throw new AppError("FORBIDDEN", "Your role does not allow this action.");
  }
  return staff;
}

export const actorOf = (staff: Staff): Actor => ({ id: staff.id, role: staff.role, ...(staff.viewAs ? { readOnly: true } : {}) });
