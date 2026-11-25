"use client";

import { saveStation, type PrintLayout, type StationSettings } from "@/lib/station";
import { cn } from "@/lib/utils/cn";
import { useStation } from "./use-station";

const choice = (on: boolean) =>
  cn("flex min-h-11 items-start gap-3 rounded-md border px-4 py-3 text-left", on ? "border-navy-800 bg-navy-50" : "border-hairline bg-ivory-50 hover:bg-ink-900/4");

function Options<T extends string | null>({ legend, value, options, onPick }: { legend: string; value: T; options: { value: T; label: string; hint: string }[]; onPick: (v: T) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-ink-900">{legend}</legend>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onPick(o.value)} className={cn(choice(value === o.value), "w-full")}>
          <span className={cn("mt-1 size-3 shrink-0 rounded-full border", value === o.value ? "border-navy-800 bg-navy-800" : "border-ink-400")} aria-hidden />
          <span>
            <span className="block text-[15px] text-ink-900">{o.label}</span>
            <span className="block text-xs text-ink-500">{o.hint}</span>
          </span>
        </button>
      ))}
    </fieldset>
  );
}

/** "This station" (hardware brief H5): saved in this browser only. Each change saves at once. */
export function StationSettingsForm() {
  const s = useStation();
  const set = (patch: Partial<StationSettings>) => {
    const next = { ...s, ...patch };
    // Choosing 80mm switches auto-print on (the bar); A4 leaves it as it was; "don't print" switches it off.
    if (patch.printLayout === "80mm" && patch.autoPrint === undefined) next.autoPrint = true;
    if (next.printLayout === "none") next.autoPrint = false;
    saveStation(next);
  };
  return (
    <div className="max-w-xl space-y-8">
      <Options<StationSettings["counter"]>
        legend="Counter the till opens on"
        value={s.counter}
        onPick={(counter) => set({ counter })}
        options={[
          { value: "bar", label: "Bar", hint: "This computer is at the bar." },
          { value: "restaurant", label: "Restaurant", hint: "This computer is in the restaurant." },
          { value: null, label: "No preference", hint: "The till starts on the bar." },
        ]}
      />
      <Options<PrintLayout>
        legend="Printing"
        value={s.printLayout}
        onPick={(printLayout) => set({ printLayout })}
        options={[
          { value: "80mm", label: "80mm receipt printer", hint: "The bar: narrow till rolls." },
          { value: "a4", label: "A4 printer", hint: "The front desk: full-page bills and receipts." },
          { value: "none", label: "Don't print", hint: "No printer here (show receipts on screen only)." },
        ]}
      />
      <label className={cn(choice(s.autoPrint), s.printLayout === "none" && "opacity-50")}>
        <input type="checkbox" checked={s.autoPrint} disabled={s.printLayout === "none"} onChange={(e) => set({ autoPrint: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-navy-800" />
        <span>
          <span className="block text-[15px] text-ink-900">Print the receipt as soon as a payment is taken</span>
          <span className="block text-xs text-ink-500">Once per receipt. With Chrome&apos;s kiosk printing it prints without a dialog.</span>
        </span>
      </label>
      <p className="text-xs text-ink-500">These settings are for this computer only, saved in this browser. Each computer is set up once.</p>
    </div>
  );
}
