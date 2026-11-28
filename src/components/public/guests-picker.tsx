"use client";

import { Minus, Plus } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { plural } from "@/lib/format";

export const MAX_GUESTS = 6;
export type Party = { adults: number; children: number };

export const partyLabel = (p: Party) => [plural(p.adults, "adult"), p.children ? plural(p.children, "child", "children") : ""].filter(Boolean).join(", ");

function Row({ label, hint, value, min, canAdd, onChange }: { label: string; hint: string; value: number; min: number; canAdd: boolean; onChange: (n: number) => void }) {
  const step = "flex size-11 items-center justify-center rounded-full border border-[#cfcabd] bg-white text-ink-900 hover:bg-ivory-100 disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-[15px] font-semibold text-ink-900">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={step} aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus className="size-4" aria-hidden />
        </button>
        <output aria-live="polite" className="w-6 text-center text-base font-bold tabular-nums">{value}</output>
        <button type="button" className={step} aria-label={`More ${label.toLowerCase()}`} disabled={!canAdd} onClick={() => onChange(value + 1)}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Adults and children (design D4 on desktop, D5 in a bottom sheet). The booking counts them together as guests. */
export function GuestsPicker({ party, onChange, onDone, note, large }: { party: Party; onChange: (p: Party) => void; onDone: () => void; note?: string; large?: boolean }) {
  const room = party.adults + party.children < MAX_GUESTS;
  return (
    <div>
      <Row label="Adults" hint="13 or older" value={party.adults} min={1} canAdd={room} onChange={(adults) => onChange({ ...party, adults })} />
      <Row label="Children" hint="Under 13" value={party.children} min={0} canAdd={room} onChange={(children) => onChange({ ...party, children })} />
      {large ? (
        <button type="button" onClick={onDone} className={buttonStyles({ size: "lg", className: "mt-3 w-full" })}>Done</button>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <span className="text-[13px] text-muted">{note ?? `Up to ${MAX_GUESTS} guests per booking`}</span>
          <button type="button" onClick={onDone} className={buttonStyles({ size: "sm" })}>Done</button>
        </div>
      )}
    </div>
  );
}
