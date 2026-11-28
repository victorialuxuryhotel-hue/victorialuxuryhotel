"use client";

import { useSyncExternalStore } from "react";
import { Field, Select } from "@/components/ui/form";
import { saveStation, type PrintLayout, type StationSettings } from "@/lib/station";
import { useStation } from "./use-station";

type Check = { label: string; value: string; ok: boolean };

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  document.addEventListener("fullscreenchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    document.removeEventListener("fullscreenchange", cb);
  };
};

function readChecks(): string {
  const chrome = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1];
  const edge = /Edg\/(\d+)/.test(navigator.userAgent);
  const full = window.matchMedia("(display-mode: fullscreen)").matches || Boolean(document.fullscreenElement) || window.innerHeight === screen.height;
  const checks: Check[] = [
    { label: "Browser", value: chrome ? `${edge ? "Edge" : "Chrome"} ${chrome} · ${Number(chrome) >= 120 ? "OK" : "update it"}` : "Not Chrome · use Chrome", ok: Boolean(chrome && Number(chrome) >= 120) },
    { label: "Screen size", value: `${window.innerWidth} × ${window.innerHeight} · ${window.innerWidth >= 1280 ? "OK" : "small"}`, ok: window.innerWidth >= 1280 },
    { label: "Full screen (kiosk)", value: full ? "On" : "Off", ok: full },
    { label: "Connection", value: navigator.onLine ? "Online" : "Offline", ok: navigator.onLine },
  ];
  return JSON.stringify(checks);
}

/** "This station" (design S3; hardware brief H5): settings for this computer only, saved in this browser. */
export function StationSettingsForm() {
  const s = useStation();
  const checks = JSON.parse(useSyncExternalStore(subscribe, readChecks, () => "[]")) as Check[];
  const set = (patch: Partial<StationSettings>) => {
    const next = { ...s, ...patch };
    // Choosing 80mm switches auto-print on (the bar); A4 leaves it as it was; "don't print" switches it off.
    if (patch.printLayout === "80mm" && patch.autoPrint === undefined) next.autoPrint = true;
    if (next.printLayout === "none") next.autoPrint = false;
    saveStation(next);
  };
  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-5 rounded-xl border border-hairline bg-white p-5">
        <h2 className="text-base font-bold text-ink-900">This computer</h2>
        <div className="flex flex-wrap gap-4">
          <Field label="Till opens on" htmlFor="st-counter">
            <Select id="st-counter" value={s.counter ?? ""} onChange={(e) => set({ counter: (e.target.value || null) as StationSettings["counter"] })} className="w-52">
              <option value="bar">Bar counter</option>
              <option value="restaurant">Restaurant</option>
              <option value="">No preference (bar)</option>
            </Select>
          </Field>
          <Field label="Receipt printer" htmlFor="st-print">
            <Select id="st-print" value={s.printLayout} onChange={(e) => set({ printLayout: e.target.value as PrintLayout })} className="w-56">
              <option value="80mm">80 mm thermal</option>
              <option value="a4">A4 (front desk)</option>
              <option value="none">No printer</option>
            </Select>
          </Field>
        </div>
        <label className={`flex items-start gap-3 text-sm ${s.printLayout === "none" ? "opacity-50" : ""}`}>
          <input type="checkbox" checked={s.autoPrint} disabled={s.printLayout === "none"} onChange={(e) => set({ autoPrint: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-navy-900" />
          <span><span className="block font-medium text-ink-900">Print the receipt as soon as a payment is taken</span><span className="block text-xs text-ink-500">Once per receipt. With Chrome&apos;s kiosk printing it prints without a dialog.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={s.tillDark} onChange={(e) => set({ tillDark: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-navy-900" />
          <span><span className="block font-medium text-ink-900">Dark till</span><span className="block text-xs text-ink-500">Light text on a dark screen, for a dim bar at night. Pay stays the brightest button.</span></span>
        </label>
        <p className="text-xs text-ink-500">Saved on this computer as soon as you change it. The screen locks after 5 idle minutes at a till and 10 at the desk.</p>
      </section>
      <section className="h-fit rounded-xl border border-hairline bg-white p-5">
        <h2 className="text-base font-bold text-ink-900">Checks</h2>
        <dl className="mt-3 divide-y divide-hairline text-sm">
          {checks.map((c) => (
            <div key={c.label} className="flex justify-between gap-3 py-2"><dt className="text-ink-600">{c.label}</dt><dd className={c.ok ? "text-ink-900" : "font-semibold text-[#8a4b06]"}>{c.value}</dd></div>
          ))}
          <div className="flex justify-between gap-3 py-2"><dt className="text-ink-600">Silent printing</dt><dd className="text-right text-ink-900">See the station guide</dd></div>
        </dl>
      </section>
    </div>
  );
}
