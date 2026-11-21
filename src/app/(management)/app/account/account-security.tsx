"use client";

import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

/** Clerk's security settings (password, active sessions), styled to match. */
export function AccountSecurity() {
  return (
    <div className="p-5">
      <UserProfile
        routing="hash"
        appearance={{
          ...clerkAppearance,
          elements: { ...clerkAppearance.elements, navbar: "hidden", navbarMobileMenuRow: "hidden", pageScrollBox: "p-0", scrollBox: "shadow-none" },
        }}
      />
    </div>
  );
}
