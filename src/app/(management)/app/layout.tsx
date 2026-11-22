import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import type { Metadata } from "next";
import { DeskTabs, MobileBar, Sidebar } from "@/components/management/nav";
import { managementNav } from "@/components/management/nav-items";
import { StaffCard } from "@/components/management/staff-card";
import { LoadingState } from "@/components/ui/feedback";
import { can, type Permission } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Every management page depends on the staff session, so it can't have a
// prerendered "instant" shell; opt the segment out of that validation.
export const instant = false;

/** Which permission (if any) each nav entry needs. Pages re-check on their own. */
const navPermission: Partial<Record<(typeof managementNav)[number]["href"], Permission[]>> = {
  "/app/settings": ["settings.manage", "staff.manage"],
};

/**
 * The staff session is read inside a Suspense boundary (required by Cache
 * Components). requireStaff() redirects to /login when there is no ACTIVE
 * staff session. This is the real gate; the proxy redirect is only a fast path.
 */
async function StaffShell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  // Visible when the entry needs no permission, or the role has any of those listed.
  const allowed = managementNav
    .filter((item) => {
      const needs = navPermission[item.href];
      return !needs || needs.some((p) => can(staff.role, p));
    })
    .map((item) => item.href);
  const footer = <StaffCard fullName={staff.fullName} role={staff.role} />;
  return (
    <>
      <Sidebar allowed={allowed} footer={footer} />
      <MobileBar allowed={allowed} footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {staff.role === "front_desk" ? <DeskTabs /> : null}
    </>
  );
}

export default function ManagementLayout({ children }: LayoutProps<"/app">) {
  return (
    <ClerkProvider signInUrl="/login">
      <div className="flex min-h-screen flex-1 flex-col bg-ivory-100 lg:flex-row">
        <Suspense fallback={<LoadingState label="Checking your access…" />}>
          <StaffShell>{children}</StaffShell>
        </Suspense>
      </div>
    </ClerkProvider>
  );
}
