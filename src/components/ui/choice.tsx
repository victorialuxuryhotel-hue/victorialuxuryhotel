"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Design R1, "three controls, three jobs": Segmented for one choice of 2–4 that changes the form, Tabs to
// switch what an area shows, Chips to filter a list (several at once). A dropdown (Select) for long lists.

type Option<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

/** One choice of 2–4 that changes the form (Cash / Transfer / POS). Works inside a form via `name`. */
export function Segmented<T extends string>({
  options, value, onChange, name, label, size = "md", className,
}: {
  options: readonly Option<T>[]; value: T; onChange: (v: T) => void; name?: string; label: string; size?: "md" | "lg"; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex w-fit max-w-full gap-1 rounded-lg bg-[#eae7df] p-1", className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-4 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-500",
            size === "lg" ? "h-13 text-base" : "h-10 text-[15px]",
            value === o.value ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-ink-600 hover:text-ink-900",
            o.disabled && "cursor-not-allowed opacity-45",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** Switch what an area shows (All / Beer / Spirits). */
export function Tabs<T extends string>({ options, value, onChange, label, className }: { options: readonly Option<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-5 overflow-x-auto border-b border-hairline", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "-mb-px shrink-0 border-b-[3px] px-0.5 pb-2.5 text-[15px] font-semibold whitespace-nowrap",
            value === o.value ? "border-navy-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A filter chip: narrows a list; several can be on at once. */
export function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-[34px] w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
        on ? "border-navy-700 bg-[#e8eefb] text-navy-800" : "border-hairline bg-white text-ink-700 hover:border-ink-400",
        className,
      )}
    >
      {on ? <span aria-hidden>✓</span> : null}
      {children}
    </button>
  );
}

/** A KPI tile: a label and a big tabular number. */
export function Kpi({ label, value, note, tone, className }: { label: string; value: ReactNode; note?: ReactNode; tone?: "warning" | "danger" | "success"; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-hairline bg-white p-4", className)}>
      <p className="text-[13px] font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "danger" ? "text-[#a61b1b]" : tone === "warning" ? "text-[#8a4b06]" : tone === "success" ? "text-[#166534]" : "text-ink-900")}>{value}</p>
      {note ? <p className="mt-0.5 text-[13px] text-ink-500">{note}</p> : null}
    </div>
  );
}
