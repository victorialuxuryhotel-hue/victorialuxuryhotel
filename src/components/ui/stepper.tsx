"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Stepper({ id, name, min = 1, max, defaultValue = min, unit, className }: {
  id: string;
  name: string;
  min?: number;
  max: number;
  defaultValue?: number;
  unit: [singular: string, plural: string];
  className?: string;
}) {
  const [value, setValue] = useState(Math.min(Math.max(defaultValue, min), max));
  const shown = Math.min(value, max);
  const button = "flex h-full w-11 items-center justify-center text-navy-700 disabled:text-ink-300";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-11.5 items-center justify-between rounded-md border border-ink-300 bg-ivory-50 pl-3 md:h-10">
        <output id={id} aria-live="polite" className="text-base tabular-nums text-ink-900 md:text-sm">
          {shown} {shown === 1 ? unit[0] : unit[1]}
        </output>
        <input type="hidden" name={name} value={shown} />
        <span className="flex h-full">
          <button type="button" aria-label={`Fewer ${unit[1]}`} aria-controls={id} disabled={shown <= min} onClick={() => setValue(shown - 1)} className={button}>
            <Minus className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label={`More ${unit[1]}`} aria-controls={id} disabled={shown >= max} onClick={() => setValue(shown + 1)} className={cn(button, "border-l border-ink-300")}>
            <Plus className="size-4" aria-hidden />
          </button>
        </span>
      </div>
      {shown >= max ? <p className="text-xs text-ink-500">{max} is the most for this room type.</p> : null}
    </div>
  );
}
