"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { guestFont as staffFont } from "@/components/public/guest-font";
import { cn } from "@/lib/utils/cn";

/**
 * A panel from the right over the page (designs X2–X5): a title, a subtitle, a close button, the content, and
 * the main button at the foot. Escape or the backdrop closes it.
 */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "w-[440px]" }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={`staff ${staffFont.variable} fixed inset-0 z-[90] flex justify-end print:hidden`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy-950/40" />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} className={cn("relative flex h-full max-w-full flex-col bg-white shadow-xl outline-none", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-ink-600">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-md p-2 text-ink-500 hover:bg-ivory-100 hover:text-ink-900">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-col items-center gap-2 border-t border-hairline px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
