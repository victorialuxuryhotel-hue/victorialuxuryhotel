"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Whether the browser has a connection (hardware brief H9). Money and check-in/out buttons are off while it doesn't. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export const OFFLINE_REASON = "No internet connection. Wait for it to come back.";

/** Always-visible banner while the connection is down. */
export function ConnectionBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="alert" className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-danger-700 px-4 py-2.5 text-sm font-medium text-white print:hidden">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      No internet connection. Your last action may not have saved. Don&apos;t take payment until this clears.
    </p>
  );
}
