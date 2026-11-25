import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import type { Metadata } from "next";
import { DeskTabs, MobileBar, Sidebar } from "@/components/management/nav";
import { managementNav } from "@/components/management/nav-items";
import { BrowserBanner, NoteBrowser } from "@/components/management/browser-check";
import { IdleLock } from "@/components/management/idle-lock";
import { StaffCard } from "@/components/management/staff-card";
import { policy } from "@/config/policy";
import { staffRole } from "@/domain/status";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { Eye } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { exitViewAs, startViewAsFrontDesk } from "@/server/view-as";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export const instant = false;

async function StaffShell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const allowed = managementNav.filter((item) => !item.permission || item.permission.some((p) => can(staff.role, p))).map((item) => item.href);
  const footer = (
    <StaffCard fullName={staff.fullName} role={staff.viewAs ? "owner" : staff.role}>
      {staff.role === "owner" && !staff.viewAs ? (
        <form action={startViewAsFrontDesk}>
          <button type="submit" className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-ivory-200/80 hover:bg-ivory-50/10 hover:text-white">
            <Eye className="size-4" aria-hidden /> View as front desk
          </button>
        </form>
      ) : null}
    </StaffCard>
  );
  return (
    <>
      <BrowserBanner />
      <NoteBrowser sessionKey={staff.id} />
      {staff.viewAs ? <ViewAsBanner /> : null}
      <IdleLock name={staff.fullName} roleLabel={staffRole[staff.role]} minutes={policy.idleLockMinutes} />
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <Sidebar allowed={allowed} footer={footer} />
        <MobileBar allowed={allowed} footer={footer} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        {staff.role === "front_desk" ? <DeskTabs /> : null}
      </div>
    </>
  );
}

function ViewAsBanner() {
  return (
    <div role="status" className="flex min-h-11 items-center justify-center gap-3 border-b border-gold-500 bg-gold-100 px-4 py-1.5 text-sm text-navy-950">
      <span>
        <strong className="font-semibold">Viewing as front desk</strong> · Read-only. Actions are switched off.
      </span>
      <form action={exitViewAs}>
        <button type="submit" className="min-h-9 rounded-md border border-navy-950 px-3 text-sm hover:bg-navy-950/10">Exit</button>
      </form>
    </div>
  );
}

export default function ManagementLayout({ children }: LayoutProps<"/app">) {
  return (
    <ClerkProvider signInUrl="/login">
      <div className="flex min-h-screen flex-1 flex-col bg-ivory-100">
        <Suspense fallback={<LoadingState label="Checking your access…" />}>
          <StaffShell>{children}</StaffShell>
        </Suspense>
      </div>
    </ClerkProvider>
  );
}
