"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A panel that opens under its trigger (design D4: the guest's account menu, the guests picker).
 * Closes on Escape, on a click outside, and when `children` calls `close`. Focus returns to the trigger.
 */
export function Popover({
  label,
  trigger,
  triggerClassName,
  panelClassName,
  align = "end",
  role = "dialog",
  children,
}: {
  /** Accessible name of the panel. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  align?: "start" | "end" | "stretch";
  role?: "dialog" | "menu";
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => {
    setOpen(false);
    document.getElementById(`${id}-trigger`)?.focus();
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={root} className="relative">
      <button
        id={`${id}-trigger`}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup={role === "menu" ? "menu" : "dialog"}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <div
        id={id}
        role={role}
        aria-label={label}
        hidden={!open}
        className={cn(
          "absolute top-[calc(100%+6px)] z-50 rounded-xl border border-hairline bg-white shadow-[0_10px_30px_rgba(11,31,92,0.14)]",
          align === "end" ? "right-0" : align === "start" ? "left-0" : "inset-x-0",
          panelClassName,
        )}
      >
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>
  );
}
