import Link from "next/link";
import { LogOut } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import { staffRole, type StaffRole } from "@/domain/status";

export function StaffCard({ fullName, role }: { fullName: string; role: StaffRole }) {
  const initials = fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <Link href="/app/account" className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:opacity-90">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-sm font-semibold text-navy-950">{initials}</span>
        <span className="min-w-0 text-sm">
          <span className="block truncate font-medium text-ivory-50">{fullName}</span>
          <span className="block text-xs text-ivory-200/60">{staffRole[role]}</span>
        </span>
      </Link>
      <SignOutButton redirectUrl="/login">
        <button type="button" aria-label="Sign out" title="Sign out" className="rounded-md p-2 text-ivory-200/70 hover:bg-white/10 hover:text-white">
          <LogOut className="size-4" aria-hidden />
        </button>
      </SignOutButton>
    </div>
  );
}
