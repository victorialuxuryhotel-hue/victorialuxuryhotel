"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

export function MobileActionBar({ label, amount, children }: { label: string; amount: string; children: React.ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 leading-tight">
            <span className="block text-xs text-muted">{label}</span>
            <span className="block text-xl font-bold text-ink-900 tabular-nums">{amount}</span>
          </p>
          {children}
        </div>
      </div>
      {mounted ? createPortal(<div aria-hidden className="h-24 shrink-0 bg-white lg:hidden" />, document.body) : null}
    </>
  );
}
