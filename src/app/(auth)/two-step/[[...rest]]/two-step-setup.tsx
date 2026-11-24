"use client";

import { SignOutButton, UserProfile, useUser } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

function SignInAgain({ done }: { done: boolean }) {
  return (
    <div className="space-y-5">
      <FormMessage tone={done ? "success" : undefined}>
        {done
          ? "Your authenticator app is set up. Keep your backup codes somewhere safe. Now sign in again: you'll be asked for a code from the app."
          : "Your authenticator app is set up, but this sign-in didn't use it. Sign in again: you'll be asked for a code from the app."}
      </FormMessage>
      <SignOutButton redirectUrl="/login">
        <Button type="button" size="lg" className="w-full">
          Sign in again
        </Button>
      </SignOutButton>
    </div>
  );
}

export function TwoStepSetup({ state }: { state: "setup" | "signin" }) {
  const { user } = useUser();

  if (state === "signin") return <SignInAgain done={false} />;
  return (
    <div className="space-y-6">
      {user?.totpEnabled ? (
        <SignInAgain done />
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
          <li>
            Under <b>Two-step verification</b>, choose{" "}
            <b>Add two-step verification</b>, then{" "}
            <b>Authenticator application</b>.
          </li>
          <li>
            Scan the QR code with the app on your phone, then type the 6-digit
            code it shows.
          </li>
          <li>Save the backup codes. You need one if you lose your phone.</li>
        </ol>
      )}
      <UserProfile
        routing="path"
        path="/two-step"
        appearance={{
          ...clerkAppearance,
          elements: {
            ...clerkAppearance.elements,
            rootBox: "!w-full",
            cardBox:
              "!w-full !max-w-none rounded-card border border-hairline bg-ivory-50 shadow-card",
            scrollBox: "rounded-none shadow-none",
            navbar: "!hidden",
            navbarMobileMenuRow: "!hidden",
            profileSection__password: "!hidden",
            profileSection__activeDevices: "!hidden",
            profileSection__passkeys: "!hidden",
            profileSection__danger: "!hidden",
            footer: "!hidden",
          },
        }}
      />
      <SignOutButton redirectUrl="/login">
        <button
          type="button"
          className="min-h-11 text-sm text-ink-500 underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
