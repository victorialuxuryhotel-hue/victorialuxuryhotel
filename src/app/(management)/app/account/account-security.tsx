"use client";

import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

/**
 * Clerk's account panel (profile, password, signed-in devices), styled to
 * match. Its own menu switches between Profile and Security. Clerk sets a
 * fixed width on this panel, so the width rules are marked important.
 */
export function AccountSecurity() {
  return (
    <UserProfile
      routing="hash"
      appearance={{
        ...clerkAppearance,
        elements: {
          ...clerkAppearance.elements,
          rootBox: "!w-full",
          cardBox: "!w-full !max-w-none rounded-card border border-ivory-200 bg-white shadow-card",
          scrollBox: "rounded-none shadow-none",
        },
      }}
    />
  );
}
