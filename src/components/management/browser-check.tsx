"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AlertTriangle } from "lucide-react";
import { browserProblem } from "@/lib/browser-check";
import { noteBrowser } from "@/server/browser";

const noop = () => () => {};
const userAgent = () => navigator.userAgent;

/** Warns (never blocks) when this computer's browser is too old for the system (hardware brief H8). */
export function BrowserBanner() {
  const ua = useSyncExternalStore(noop, userAgent, () => "");
  const problem = ua ? browserProblem(ua) : null;
  if (!problem) return null;
  return (
    <p role="alert" className="flex items-center justify-center gap-2 border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-sm text-warning-700 print:hidden">
      <AlertTriangle className="size-4 shrink-0" aria-hidden /> {problem}
    </p>
  );
}

/** Notes the browser in Activity once per sign-in session (for support). */
export function NoteBrowser({ sessionKey }: { sessionKey: string }) {
  useEffect(() => {
    try {
      const key = `victoria-browser-noted:${sessionKey}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      return; // storage blocked: skip rather than log on every page
    }
    void noteBrowser(navigator.userAgent);
  }, [sessionKey]);
  return null;
}
