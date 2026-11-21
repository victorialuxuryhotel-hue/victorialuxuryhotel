"use client";

import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

export function AcceptInvitation() {
  return <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/app" appearance={clerkAppearance} />;
}
