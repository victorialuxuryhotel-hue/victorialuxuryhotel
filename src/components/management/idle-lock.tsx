"use client";

import { useClerk } from "@clerk/nextjs";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StationSignIn, type RosterPerson } from "@/components/management/station-sign-in";
import { lockStation, stationHeartbeat, stationRoster } from "@/server/station";

/** Any "Lock" button on a station asks the lock to come on. */
export const LOCK_EVENT = "vl:lock";
export const requestLock = () => window.dispatchEvent(new Event(LOCK_EVENT));

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
 * The lock on a shared station (FUNCTIONALITY.md section 1). After the station's idle time, or when
 * someone taps Lock, the server session ends and the name grid covers the screen. The page underneath
 * isn't reloaded, so an open order or a half-filled form stays as it was for whoever signs in next;
 * the page then refreshes so names and permissions are theirs. Activity on screen keeps the server
 * session alive (at most one heartbeat a minute), and a heartbeat that finds the session gone locks.
 */
export function StationLock({ stationName, minutes }: { stationName: string; minutes: number }) {
  const [locked, setLocked] = useState(false);
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBeat = useRef(0); // the first tap after the page loads sends a heartbeat
  const router = useRouter();

  const lock = useCallback(async (reason: "lock" | "idle") => {
    setLocked(true);
    await lockStation(reason).catch(() => undefined);
    setRoster(await stationRoster().catch(() => []));
  }, []);

  useEffect(() => {
    const onLock = () => void lock("lock");
    window.addEventListener(LOCK_EVENT, onLock);
    return () => window.removeEventListener(LOCK_EVENT, onLock);
  }, [lock]);

  useEffect(() => {
    if (locked) return;
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void lock("idle"), lockAfterMs(minutes));
      if (Date.now() - lastBeat.current > 60_000) {
        lastBeat.current = Date.now();
        void stationHeartbeat()
          .then((r) => {
            if (!r.signedIn) void lock("idle");
          })
          .catch(() => undefined); // offline: the connection banner says so; the timer still locks
      }
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      events.forEach((e) => window.removeEventListener(e, arm));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [locked, minutes, lock]);

  if (!locked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Locked" className="fixed inset-0 z-[100] flex overflow-y-auto bg-navy-950 print:hidden">
      <StationSignIn
        stationName={stationName}
        roster={roster}
        onSignedIn={() => {
          lastBeat.current = Date.now();
          setLocked(false);
          router.refresh();
        }}
      />
    </div>
  );
}

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

/** "Signed in as Bisi (Front desk) · Switch user": always visible on shared screens (the till, Today). On a station, Lock. */
export function SignedInStrip({ name, roleLabel, onStation = false }: { name: string; roleLabel: string; onStation?: boolean }) {
  if (onStation) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-600 print:hidden">
        <span>
          Signed in as <span className="font-medium text-ink-900">{name}</span> ({roleLabel})
        </span>
        <button type="button" onClick={requestLock} className="min-h-9 rounded-md px-2 font-medium text-navy-800 hover:underline pointer-coarse:min-h-11">
          Lock
        </button>
      </div>
    );
  }
  return <ClerkSignedInStrip name={name} roleLabel={roleLabel} />;
}

function ClerkSignedInStrip({ name, roleLabel }: { name: string; roleLabel: string }) {
  const { signOut } = useClerk();
  return (
    <div className="flex items-center gap-2 text-sm text-ink-600 print:hidden">
      <span>
        Signed in as <span className="font-medium text-ink-900">{name}</span> ({roleLabel})
      </span>
      <button type="button" onClick={() => signOut({ redirectUrl: "/login" })} className="min-h-9 rounded-md px-2 font-medium text-navy-800 hover:underline pointer-coarse:min-h-11">
        Switch user
      </button>
    </div>
  );
}

/** "Lock" in the account menu on a station. */
export function LockButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={requestLock} className={className}>
      <Lock className="size-4" aria-hidden /> Lock
    </button>
  );
}
