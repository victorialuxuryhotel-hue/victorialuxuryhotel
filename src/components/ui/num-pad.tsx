"use client";

import { Delete } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * On-screen number pad for touch stations (hardware brief H4): every number at the bar is entered
 * here, so the Windows touch keyboard never opens. Fields that use it set inputMode="none" (no
 * on-screen keyboard) but still accept a physical keyboard.
 */
export function NumPad({
  onChange,
  maxLength = 12,
  decimal = false,
  label,
  className,
}: {
  /** A state setter: each tap builds on the latest value, so quick taps never drop a digit. */
  onChange: Dispatch<SetStateAction<string>>;
  maxLength?: number;
  /** Allows one decimal point (naira amounts). */
  decimal?: boolean;
  /** What the pad types into, for screen readers. */
  label: string;
  className?: string;
}) {
  const press = (k: string) =>
    onChange((prev) => {
      if (k === "back") return prev.slice(0, -1);
      if (k === "clear") return "";
      if (k === "." && (!decimal || prev.includes("."))) return prev;
      return prev.length >= maxLength ? prev : prev + k;
    });
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"];
  return (
    <div role="group" aria-label={`Number pad for ${label}`} className={cn("grid grid-cols-3 gap-1.5", className)}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          aria-label={k === "back" ? "Delete last digit" : k === "clear" ? "Clear" : k === "." ? "Decimal point" : k}
          className="flex h-11 items-center justify-center rounded-md border border-hairline bg-ivory-50 text-lg font-medium tabular-nums text-ink-900 active:bg-navy-50"
        >
          {k === "back" ? <Delete className="size-5" aria-hidden /> : k === "clear" ? <span className="text-sm">Clear</span> : k}
        </button>
      ))}
    </div>
  );
}
