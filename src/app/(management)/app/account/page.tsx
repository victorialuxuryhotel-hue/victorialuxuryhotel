import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { staffRole } from "@/domain/status";
import { requireStaff } from "@/server/auth";
import { AccountSecurity } from "./account-security";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<PageHeader title="Your account" />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  const staff = await requireStaff();
  return (
    <>
      <PageHeader title="Your account" description={`${staff.fullName} · ${staffRole[staff.role]} · ${staff.email}`} />
      <div className="px-4 py-6 lg:px-8">
        <div className="max-w-5xl">
          <AccountSecurity />
        </div>
      </div>
    </>
  );
}
