import type { StaffRole } from "@/domain/status";

/** "setup": no authenticator app yet. "signin": app added, but this session was opened without it. */
export type TwoStepState = "setup" | "signin";

export const TWO_STEP_ROLES: readonly StaffRole[] = ["owner", "general_manager", "hotel_manager", "finance"];

export function twoStepOptional(flag: string | undefined, siteUrl: string | undefined): boolean {
  return flag === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(siteUrl ?? "");
}

export function twoStepState(role: StaffRole, totpEnabled: boolean, secondFactorAge: number | null | undefined): TwoStepState | undefined {
  if (!TWO_STEP_ROLES.includes(role)) return undefined;
  if (!totpEnabled) return "setup";
  return secondFactorAge != null && secondFactorAge >= 0 ? undefined : "signin";
}
