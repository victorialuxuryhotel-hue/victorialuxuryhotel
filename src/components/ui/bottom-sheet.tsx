"use client";

import { useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/use-dialog";

const noop = () => () => {};

/**
 * A panel that slides up from the bottom of the screen (phones), over a dimmed
 * page. Tap the backdrop, press Escape, or navigate to close. Focus moves in
 * and returns to the trigger. Rendered into <body> so no parent can clip it.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  trigger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  trigger?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useDialog(open, onClose, panel, trigger);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-navy-950/40 motion-reduce:animate-none" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-[sheet-up_250ms_ease-out] overflow-y-auto rounded-t-2xl bg-white px-4 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl motion-reduce:animate-none"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-300" />
        <p className="text-xl font-semibold text-ink-900">{title}</p>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
