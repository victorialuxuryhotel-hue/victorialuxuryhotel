import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { getCurrentStaff } from "@/server/auth";
import { TwoStepSetup } from "./two-step-setup";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false, follow: false } };

async function Content() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?denied=1");
  if (!staff.twoStep) redirect("/app");
  return <TwoStepSetup state={staff.twoStep} />;
}

export default function TwoStepPage() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ivory-100 px-4 py-12">
      <div className="w-full max-w-2xl">
        <Logo className="w-14" />
        <h1 className="mt-6 font-display text-4xl text-navy-950">Two-step sign-in</h1>
        <p className="mt-2 text-sm text-ink-600">
          Your role can see the hotel&apos;s money and staff, so signing in needs your password and a code from an authenticator app on your phone
          (for example Google Authenticator or Microsoft Authenticator).
        </p>
        <div className="mt-8">
          <Suspense fallback={<div className="h-56" />}>
            <Content />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
