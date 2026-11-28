"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Right-hand panel over the page (interface brief I7). The page's URL carries ?booking=…, so back and
 * refresh work; Esc, the close button or a click outside go to `closeHref`.
 */
export function PanelShell({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open], details[data-popover][open]")) router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-50 print:hidden" data-booking-panel="">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={() => router.push(closeHref, { scroll: false })} className="absolute inset-0 h-full w-full cursor-default bg-navy-950/25" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-hairline bg-white shadow-[-12px_0_32px_rgba(11,31,92,.12)] outline-none sm:w-[400px]"
      >
        <Link href={closeHref} scroll={false} aria-label="Close panel" className="absolute top-[18px] right-5 z-10 grid size-9 place-items-center rounded-lg border border-[#cfcabd] bg-white text-ink-700 hover:bg-ivory-100 hover:text-ink-900">
          <X className="size-5" aria-hidden />
        </Link>
        {children}
      </div>
    </div>
  );
}
