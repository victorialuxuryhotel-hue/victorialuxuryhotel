"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { signOutGuest } from "@/server/guest-account";

export function MyBookingLink() {
  return (
    <Link href="/account" className="inline-flex min-h-11 items-center text-[15px] text-ink-900 hover:text-navy-700">
      My booking
    </Link>
  );
}

const item = "block w-full px-3.5 py-2.5 text-left text-sm font-semibold text-ink-900 hover:bg-ivory-100 focus-visible:bg-ivory-100";

/** The signed-in guest's menu in the header (design D4). */
export function AccountMenu({ name, email }: { name: string | null; email: string }) {
  const first = name?.trim().split(/\s+/)[0] || "Account";
  return (
    <Popover
      label="Your account"
      role="menu"
      trigger={<>{first} <ChevronDown className="size-4 text-muted" aria-hidden /></>}
      triggerClassName="inline-flex min-h-11 items-center gap-1 text-[15px] text-ink-900 hover:text-navy-700"
      panelClassName="w-56 overflow-hidden pb-1.5"
    >
      {(close) => (
        <>
          <div className="border-b border-hairline px-3.5 pt-2.5 pb-2">
            {name ? <p className="text-sm font-bold text-ink-900">{name}</p> : null}
            <p className="mt-0.5 truncate text-xs text-muted">{email}</p>
          </div>
          <Link role="menuitem" href="/account" onClick={close} className={item}>Your bookings</Link>
          <div aria-hidden className="my-1.5 h-px bg-hairline" />
          <form action={signOutGuest}>
            <button role="menuitem" type="submit" className={item}>Sign out</button>
          </form>
        </>
      )}
    </Popover>
  );
}
