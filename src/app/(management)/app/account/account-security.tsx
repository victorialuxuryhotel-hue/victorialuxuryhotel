"use client";

import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

export function AccountSecurity() {
  return (
    <UserProfile
      routing="hash"
      appearance={{
        ...clerkAppearance,
        elements: {
          ...clerkAppearance.elements,
          rootBox: "!w-full",
          cardBox: "!w-full !max-w-none rounded-card border border-hairline bg-ivory-50 shadow-card",
          scrollBox: "rounded-none shadow-none",
          profileSection__activeDevices: "!hidden",
          profileSection__passkeys: "!hidden",
          profileSection__connectedAccounts: "!hidden",
          profileSection__enterpriseAccounts: "!hidden",
          profileSection__web3Wallets: "!hidden",
          profileSection__danger: "!hidden",
          profileSection__emailAddresses: "!hidden",
          profileSection__phoneNumbers: "!hidden",
          footer: "!hidden",
        },
      }}
    />
  );
}
