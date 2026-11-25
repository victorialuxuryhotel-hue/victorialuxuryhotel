"use client";

import { useClerk } from "@clerk/nextjs";
import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Shared desks and the bar terminal: after this long without a tap or key, the screen locks. */
const lockAfterMs = (minutes: number) => {
  try {
    // Browser tests shorten the wait; staff never set this.
    const override = Number(window.localStorage.getItem("victoria-idle-lock-ms"));
    if (override > 0) return override;
  } catch {
    /* storage blocked: use the policy */
  }
  return minutes * 60_000;
};

/**
 * Idle lock (hardware brief H3). Covers the screen after policy.idleLockMinutes without input:
 * "Continue" carries on in the same session (no password); "Switch user" signs out. The page
 * underneath isn't reloaded, so an order being taken at the till is still there on Continue.
 */
export function IdleLock({ name, roleLabel, minutes }: { name: string; roleLabel: string; minutes: number }) {
  const [locked, setLocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { signOut } = useClerk();

  useEffect(() => {
    if (locked) return;
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLocked(true), lockAfterMs(minutes));
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      events.forEach((e) => window.removeEventListener(e, arm));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [locked, minutes]);

  if (!locked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="locked-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950/95 p-6 print:hidden">
      <div className="w-full max-w-sm rounded-card bg-ivory-50 p-6 text-center shadow-lg">
        <Lock className="mx-auto size-8 text-navy-800" aria-hidden />
        <h2 id="locked-title" className="mt-3 font-display text-2xl text-navy-950">Locked</h2>
        <p className="mt-1 text-sm text-ink-600">
          Signed in as <span className="font-medium text-ink-900">{name}</span> ({roleLabel})
        </p>
        <div className="mt-6 grid gap-2">
          <Button size="lg" autoFocus onClick={() => setLocked(false)}>Continue as {name.split(" ")[0]}</Button>
          <Button size="lg" variant="secondary" onClick={() => signOut({ redirectUrl: "/login" })}>Switch user</Button>
        </div>
      </div>
    </div>
  );
}

/** "Signed in as Bisi (Front desk) · Switch user": always visible on shared screens (the till, Today). */
export function SignedInStrip({ name, roleLabel }: { name: string; roleLabel: string }) {
  const { signOut } = useClerk();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-ivory-50 px-3 py-1.5 text-sm text-ink-600 print:hidden">
      <span>
        Signed in as <span className="font-medium text-ink-900">{name}</span> ({roleLabel})
      </span>
      <button type="button" onClick={() => signOut({ redirectUrl: "/login" })} className="min-h-9 rounded-md px-2 font-medium text-navy-800 hover:underline pointer-coarse:min-h-11">
        Switch user
      </button>
    </div>
  );
}
