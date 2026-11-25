import Link from "next/link";
import { KeyRound, LogOut, Monitor } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import { staffRole, type StaffRole } from "@/domain/status";

export function StaffCard({ fullName, role, children }: { fullName: string; role: StaffRole; children?: React.ReactNode }) {
  const initials = fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const row = "flex min-h-10 items-center gap-2.5 rounded-md px-2 text-sm text-ivory-200/80 hover:bg-ivory-50/10 hover:text-white";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-sm font-semibold text-navy-950">{initials}</span>
        <span className="min-w-0 text-sm">
          <span className="block truncate font-medium text-ivory-50">{fullName}</span>
          <span className="block text-xs text-ivory-200/60">{staffRole[role]}</span>
        </span>
      </div>
      <div className="-mx-2 flex flex-col">
        {children}
        <Link href="/app/account" className={row}>
          <KeyRound className="size-4" aria-hidden /> Manage sign-in
        </Link>
        <Link href="/app/station" className={row}>
          <Monitor className="size-4" aria-hidden /> This station
        </Link>
        <SignOutButton redirectUrl="/login">
          <button type="button" className={`${row} w-full text-left`}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
