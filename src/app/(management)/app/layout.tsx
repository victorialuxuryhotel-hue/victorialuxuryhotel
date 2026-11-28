import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import type { Metadata } from "next";
import { DeskTabs, MobileBar, Sidebar } from "@/components/management/nav";
import { managementNav } from "@/components/management/nav-items";
import { BrowserBanner, NoteBrowser } from "@/components/management/browser-check";
import { ConnectionBanner } from "@/components/management/connection";
import { IdleLock, StationLock } from "@/components/management/idle-lock";
import { Shortcuts } from "@/components/management/shortcuts";
import { StaffCard } from "@/components/management/staff-card";
import { StaffRoleProvider } from "@/components/management/staff-role";
import { policy } from "@/config/policy";
import { staffRole } from "@/domain/status";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { idleMinutes, refusedApprovals } from "@/server/domain/stations";
import { exitViewAs, startViewAsFrontDesk } from "@/server/view-as";
import { guestFont as staffFont } from "@/components/public/guest-font";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export const instant = false;

async function StaffShell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const allowed = managementNav.filter((item) => !item.permission || item.permission.some((p) => can(staff.role, p))).map((item) => item.href);
  const footer = (
    <StaffCard fullName={staff.fullName} role={staff.viewAs ? "owner" : staff.role} onStation={Boolean(staff.station)} signedInAt={staff.station ? staff.sessionStartedAt ?? undefined : undefined}>
      {staff.role === "owner" && !staff.viewAs && !staff.station ? (
        <form action={startViewAsFrontDesk}>
          <button type="submit" role="menuitem" className="block w-full px-3.5 py-[9px] text-left text-sm font-semibold hover:bg-ivory-100">
            View as front desk<span className="block text-xs font-normal text-[#5b6372]">Read-only, to check what the desk sees</span>
          </button>
        </form>
      ) : null}
    </StaffCard>
  );
  return (
    <StaffRoleProvider role={staff.role}>
      <ConnectionBanner />
      <Shortcuts lock={Boolean(staff.station)} />
      <BrowserBanner />
      <NoteBrowser sessionKey={staff.id} />
      {staff.viewAs ? <ViewAsBanner /> : null}
      {staff.station && staff.sessionStartedAt ? <RefusedApprovals staffId={staff.id} since={staff.sessionStartedAt} /> : null}
      {staff.station ? (
        <StationLock stationName={staff.station.name} minutes={await idleMinutes(await getDb(), staff.station.type)} />
      ) : (
        <IdleLock name={staff.fullName} roleLabel={staffRole[staff.role]} minutes={policy.idleLockMinutes} />
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <Sidebar allowed={allowed} footer={footer} />
        <MobileBar allowed={allowed} footer={footer} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        {staff.role === "front_desk" ? <DeskTabs /> : null}
      </div>
    </StaffRoleProvider>
  );
}

/** FUNCTIONALITY.md section 3: a manager is told at their next sign-in when a void was refused after 3 wrong PINs under their name. */
async function RefusedApprovals({ staffId, since }: { staffId: string; since: string }) {
  const rows = await refusedApprovals(await getDb(), staffId, since);
  if (!rows.length) return null;
  return (
    <div role="alert" className="border-b border-[#f1b8b8] bg-[#fde8e8] px-4 py-2.5 text-sm text-[#a61b1b] print:hidden">
      {rows.map((r) => <p key={r.created_at}>{r.summary}. If it wasn&apos;t you, tell the owner.</p>)}
    </div>
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
      <div className={`staff ${staffFont.variable} flex min-h-screen flex-1 flex-col bg-ivory-100`}>
        <Suspense fallback={<LoadingState label="Checking your access…" />}>
          <StaffShell>{children}</StaffShell>
        </Suspense>
      </div>
    </ClerkProvider>
  );
}
