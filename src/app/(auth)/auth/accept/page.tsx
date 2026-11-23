import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { AcceptInvitation } from "./accept-invitation";

export const metadata: Metadata = { title: "Accept your invitation", robots: { index: false, follow: false } };

export default function AcceptInvitationPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-ivory-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="w-14" />
        <h1 className="mt-6 font-display text-4xl text-navy-950">Welcome to the team</h1>
        <p className="mt-2 text-sm text-ink-500">Choose a password (at least 10 characters) to finish setting up your staff account.</p>
        <div className="mt-8">
          <AcceptInvitation />
        </div>
      </div>
    </main>
  );
}
