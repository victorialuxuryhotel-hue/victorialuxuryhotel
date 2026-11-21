"use client";

import { SignIn, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

/** Only allow redirects back into the management app (no open redirects). */
function safeNext(next: string | undefined) {
  return next && /^\/app(\/[\w\-/]*)?$/.test(next) ? next : "/app";
}

export function SignInPanel({ next }: { next?: string }) {
  return <SignIn routing="hash" forceRedirectUrl={safeNext(next)} appearance={clerkAppearance} />;
}

/**
 * Signed in with Clerk, but not (or no longer) active staff. Sign-in would
 * just bounce back here, so offer to sign out instead.
 */
export function AccessDenied() {
  return (
    <div className="space-y-5">
      <FormMessage>This account doesn&apos;t have access to hotel management. If you think it should, contact the hotel manager.</FormMessage>
      <SignOutButton redirectUrl="/login">
        <Button type="button" variant="secondary" size="lg" className="w-full">
          Sign out and use another account
        </Button>
      </SignOutButton>
    </div>
  );
}
