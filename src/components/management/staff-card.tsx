"use client";

import { SignOutButton } from "@clerk/nextjs";
import { staffRole, type StaffRole } from "@/domain/status";
import { Menu, MenuHeader, MenuItem, MenuSeparator, menuItemClass } from "@/components/ui/menu";
import { cn } from "@/lib/utils/cn";
import { requestLock } from "./idle-lock";

const TZ = "Africa/Lagos";
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

/**
 * The account button at the foot of the sidebar and its menu (design D1). On a shared station (PIN sign-in)
 * the menu offers This station, Lock screen and Switch user (both lock the screen; the next person taps their
 * name); with a personal sign-in it offers Manage sign-in, This station and Sign out.
 */
export function StaffCard({ fullName, role, children, onStation = false, signedInAt }: { fullName: string; role: StaffRole; children?: React.ReactNode; onStation?: boolean; signedInAt?: string }) {
  const initials = fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Menu
      side="top"
      width="w-[250px]"
      label="Account menu"
      buttonClassName="flex w-full items-center gap-2.5 rounded-lg bg-white/6 p-2 text-left hover:bg-white/10"
      button={
        <>
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-[13px] font-bold text-[#0b1f5c]">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{fullName}</span>
            <span className="block truncate text-xs text-[#aab3d6]">{staffRole[role]}</span>
          </span>
          <span aria-hidden className="text-xs text-[#aab3d6]">▴</span>
        </>
      }
    >
      <MenuHeader>
        <p className="text-sm font-bold text-ink-900">{fullName}</p>
        <p className="mt-0.5 text-xs text-[#5b6372]">{staffRole[role]}{signedInAt ? ` · signed in ${time(signedInAt)}` : ""}</p>
      </MenuHeader>
      {onStation ? null : <MenuItem href="/app/account" hint="Password and two-step">Manage sign-in</MenuItem>}
      <MenuItem href="/app/station" hint="Counter, printers, lock time">This station</MenuItem>
      {children ? <div className="[&_button]:text-ink-900">{children}</div> : null}
      <MenuSeparator />
      {onStation ? (
        <>
          <MenuItem onSelect={requestLock} hint={<><span className="hidden pointer-fine:inline">Ctrl L · </span>Keeps you signed in</>}>Lock screen</MenuItem>
          <MenuItem onSelect={requestLock} hint="Next person signs in">Switch user</MenuItem>
        </>
      ) : (
        <SignOutButton redirectUrl="/login">
          <button type="button" role="menuitem" className={cn(menuItemClass, "text-[#a61b1b]")}>Sign out</button>
        </SignOutButton>
      )}
    </Menu>
  );
}
