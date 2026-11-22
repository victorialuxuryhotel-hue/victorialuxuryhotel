"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { formatDate, formatNaira } from "@/lib/format";
import { addExtra, addPromo, toggleExtra, togglePromo } from "@/server/settings";

type Extra = { id: string; name: string; price_kobo: number; per_night: number; is_active: number };
type Promo = { id: string; code: string; percent_off: number; valid_until: string | null; max_uses: number | null; used_count: number; is_active: number };

const row = "flex min-h-14 items-center gap-3 px-5 py-3";

function Toggle({ action, id, active }: { action: (fd: FormData) => Promise<void>; id: string; active: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <Button type="submit" size="sm" variant="ghost">{active ? "Switch off" : "Switch on"}</Button>
    </form>
  );
}

/** Extras guests can add when booking online (airport pickup, breakfast...). */
export function ExtrasManager({ extras }: { extras: Extra[] }) {
  const [state, action, pending] = useActionState(addExtra, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <div>
      {extras.length ? (
        <ul className="divide-y divide-hairline">
          {extras.map((e) => (
            <li key={e.id} className={`${row} ${e.is_active ? "" : "opacity-55"}`}>
              <span className="flex-1 text-[15px] text-ink-900">{e.name}</span>
              <span className="text-sm tabular-nums text-ink-700">{formatNaira(e.price_kobo)}{e.per_night ? " a night" : " per stay"}</span>
              <Toggle action={toggleExtra} id={e.id} active={Boolean(e.is_active)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-500">No extras yet. Add airport pickup, breakfast or anything guests can book with their room.</p>
      )}
      <form ref={form} action={action} className="grid gap-4 border-t border-hairline p-5 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-end">
        {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-4"><FormMessage>{state.message}</FormMessage></div> : null}
        <Field label="Extra" htmlFor="xname" error={err("name")}><Input id="xname" name="name" placeholder="Airport pickup" required /></Field>
        <Field label="Price (₦)" htmlFor="xprice" error={err("price")}><Input id="xprice" name="price" type="number" min={1} step="any" inputMode="decimal" required /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-700"><input type="checkbox" name="perNight" className="size-5 accent-navy-800" /> Per night</label>
        <Button type="submit" pending={pending}>Add extra</Button>
      </form>
    </div>
  );
}

/** Percentage-off codes for the website. Each use is counted; switch a code off any time. */
export function PromoManager({ promos }: { promos: Promo[] }) {
  const [state, action, pending] = useActionState(addPromo, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <div>
      {promos.length ? (
        <ul className="divide-y divide-hairline">
          {promos.map((p) => (
            <li key={p.id} className={`${row} ${p.is_active ? "" : "opacity-55"}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[15px] text-ink-900">{p.code}</span>
                <span className="block text-xs text-ink-500">
                  {p.percent_off}% off the room · used {p.used_count}{p.max_uses ? ` of ${p.max_uses}` : ""}{p.valid_until ? ` · until ${formatDate(p.valid_until, { year: false })}` : ""}
                </span>
              </span>
              <Toggle action={togglePromo} id={p.id} active={Boolean(p.is_active)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-500">No promo codes yet.</p>
      )}
      <form ref={form} action={action} className="grid gap-4 border-t border-hairline p-5 sm:grid-cols-4 sm:items-end">
        {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-4"><FormMessage>{state.message}</FormMessage></div> : null}
        <Field label="Code" htmlFor="pcode" error={err("code")}><Input id="pcode" name="code" className="uppercase" placeholder="WELCOME10" required /></Field>
        <Field label="% off" htmlFor="ppct" error={err("percentOff")}><Input id="ppct" name="percentOff" type="number" min={1} max={100} required /></Field>
        <Field label="Valid until" optional htmlFor="puntil" error={err("validUntil")}><Input id="puntil" name="validUntil" type="date" /></Field>
        <Field label="Max uses" optional htmlFor="pmax" error={err("maxUses")}><Input id="pmax" name="maxUses" type="number" min={1} /></Field>
        <div className="sm:col-span-4"><Button type="submit" pending={pending}>Create code</Button></div>
      </form>
    </div>
  );
}
