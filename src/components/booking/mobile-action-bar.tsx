"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

export function MobileActionBar({ label, amount, children }: { label: string; amount: string; children: React.ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ivory-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 leading-tight">
            <span className="block text-xs text-ink-500">{label}</span>
            <span className="block text-base font-semibold text-navy-950 tabular-nums">{amount}</span>
          </p>
          {children}
        </div>
      </div>
      {mounted ? createPortal(<div aria-hidden className="h-24 shrink-0 bg-navy-950 md:hidden" />, document.body) : null}
    </>
  );
}
