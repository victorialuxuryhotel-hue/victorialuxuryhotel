import type { StaffRole } from "@/domain/status";

/** "setup": no authenticator app yet. "signin": app added, but this session was opened without it. */
export type TwoStepState = "setup" | "signin";

export const TWO_STEP_ROLES: readonly StaffRole[] = ["owner", "general_manager", "hotel_manager", "finance"];

export function twoStepOptional(flag: string | undefined, siteUrl: string | undefined): boolean {
  return flag === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(siteUrl ?? "");
}

/**
 * Whether these roles must use two-step sign-in. On hold while the system is being tested
 * (Tobi, 25 Nov): required only once TWO_STEP_ENFORCED=1 is set, which must happen before
 * go-live (docs/release-review.md). TWO_STEP_OPTIONAL=1 on a local machine always skips it.
 */
export function twoStepRequired(env: { enforced?: string; optional?: string; siteUrl?: string }): boolean {
  if (twoStepOptional(env.optional, env.siteUrl)) return false;
  return env.enforced === "1";
}

export function twoStepState(role: StaffRole, totpEnabled: boolean, secondFactorAge: number | null | undefined): TwoStepState | undefined {
  if (!TWO_STEP_ROLES.includes(role)) return undefined;
  if (!totpEnabled) return "setup";
  return secondFactorAge != null && secondFactorAge >= 0 ? undefined : "signin";
}
