"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the page every few seconds (up to a limit) while a payment is being confirmed. */
export function AutoRefresh({ everyMs = 4000, maxTimes = 15 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (++n > maxTimes) return clearInterval(id);
      router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTimes]);
  return null;
}
