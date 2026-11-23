"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { addMenuItem, sell, toggleMenuItem, voidSale } from "@/server/pos";
import type { MenuItem, Outlet, SaleRow } from "@/server/domain/pos";

const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
const METHODS = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS" } as const;
const chip = (on: boolean) =>
  cn("inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm", on ? "border-navy-800 bg-navy-50 text-navy-800" : "border-hairline text-ink-900 hover:bg-ink-900/7");

export function Till({ menu, guests }: { menu: MenuItem[]; guests: Array<{ id: string; reference: string; guest: string; room: string | null }> }) {
  const [outlet, setOutlet] = useState<Outlet>("bar");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<string>("cash");
  const [state, action, pending] = useActionState(sell, null);
  const items = menu.filter((m) => m.outlet === outlet && m.is_active);
  const lines = useMemo(() => Object.entries(cart).map(([id, q]) => ({ item: menu.find((m) => m.id === id)!, q })).filter((l) => l.item && l.q > 0), [cart, menu]);
  const total = lines.reduce((s, l) => s + l.item.price_kobo * l.q, 0);
  const last = useRef<unknown>(null);
  useEffect(() => {
    if (state?.ok && last.current !== state) {
      last.current = state;
      setCart({});
    }
  }, [state]);
  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, (c[id] ?? 0) + d)) }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="flex gap-2" role="tablist" aria-label="Outlet">
          {(Object.keys(OUTLETS) as Outlet[]).map((o) => (
            <button key={o} type="button" role="tab" aria-selected={o === outlet} onClick={() => { setOutlet(o); setCart({}); }} className={chip(o === outlet)}>{OUTLETS[o]}</button>
          ))}
        </div>
        {items.length ? (
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => add(m.id, 1)} className={cn("flex min-h-20 w-full flex-col items-start justify-between rounded-md border p-3 text-left", cart[m.id] ? "border-navy-800 bg-navy-50" : "border-hairline bg-ivory-50 hover:bg-ink-900/4")}>
                  <span className="text-[15px] text-ink-900">{m.name}</span>
                  <span className="mt-1 flex w-full justify-between text-sm tabular-nums text-ink-600">{formatNaira(m.price_kobo)}{cart[m.id] ? <span className="font-semibold text-navy-800">× {cart[m.id]}</span> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-500">No {OUTLETS[outlet].toLowerCase()} items yet. A manager adds them below.</p>
        )}
      </div>

      <form action={action} className="h-fit space-y-4 rounded-card border border-hairline bg-ivory-50 p-5 lg:sticky lg:top-24">
        <input type="hidden" name="outlet" value={outlet} />
        <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ menuItemId: l.item.id, quantity: l.q })))} />
        <input type="hidden" name="pay" value={pay} />
        <p className="font-display text-2xl text-navy-950">This sale</p>
        {state?.ok ? <FormMessage tone="success">Sale #{state.data.number} recorded: {formatNaira(state.data.totalKobo)}.</FormMessage> : null}
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        {lines.length ? (
          <ul className="divide-y divide-hairline">
            {lines.map((l) => (
              <li key={l.item.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm text-ink-900">{l.item.name}</span>
                <button type="button" aria-label={`One less ${l.item.name}`} onClick={() => add(l.item.id, -1)} className="flex size-11 items-center justify-center text-navy-700"><Minus className="size-4" /></button>
                <span className="w-6 text-center tabular-nums">{l.q}</span>
                <button type="button" aria-label={`One more ${l.item.name}`} onClick={() => add(l.item.id, 1)} className="flex size-11 items-center justify-center text-navy-700"><Plus className="size-4" /></button>
                <span className="w-24 text-right text-sm tabular-nums">{formatNaira(l.item.price_kobo * l.q)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-500">Tap items to add them.</p>}
        <div className="flex justify-between border-t border-hairline pt-3 text-lg font-semibold tabular-nums"><span>Total</span><span>{formatNaira(total)}</span></div>
        <fieldset>
          <legend className="mb-2 text-[13px] text-ink-700">Paid by</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(METHODS).map(([k, v]) => <button key={k} type="button" aria-pressed={pay === k} onClick={() => setPay(k)} className={chip(pay === k)}>{v}</button>)}
            <button type="button" aria-pressed={pay === "room"} disabled={!guests.length} onClick={() => setPay("room")} className={cn(chip(pay === "room"), "disabled:opacity-45")}>Charge to room</button>
          </div>
        </fieldset>
        {pay === "room" ? (
          <Field label="Guest staying now" htmlFor="rid">
            <Select id="rid" name="reservationId" defaultValue="" required>
              <option value="" disabled>Choose…</option>
              {guests.map((g) => <option key={g.id} value={g.id}>{g.room ? `Room ${g.room} · ` : ""}{g.guest} ({g.reference})</option>)}
            </Select>
          </Field>
        ) : null}
        <Button type="submit" size="lg" pending={pending} disabled={!lines.length} className="w-full">
          {pay === "room" ? "Charge to room" : `Take ${formatNaira(total)}`}
        </Button>
      </form>
    </div>
  );
}

function VoidSale({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(voidSale, null);
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Void</Button>;
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="Why?" className="h-9 min-w-0 flex-1 text-sm" required />
      <Button type="submit" size="sm" variant="danger" pending={pending}>Void</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Keep</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

const statusLabel = { paid: "Paid", room_charge: "On room", settled: "Paid (room)", void: "Voided" } as const;

export function SalesList({ sales, canVoid }: { sales: SaleRow[]; canVoid: boolean }) {
  if (!sales.length) return <p className="px-5 py-4 text-sm text-ink-500">No sales yet today.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {sales.map((s) => (
        <li key={s.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3", s.status === "void" && "opacity-55")}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-ink-900">#{s.number} · {OUTLETS[s.outlet]}</p>
            <p className="truncate text-xs text-ink-500">
              {s.items}{s.room_reference ? ` · ${s.room_reference}` : ""}{s.method ? ` · ${METHODS[s.method]}` : ""}{s.sold_by_name ? ` · ${s.sold_by_name}` : ""}
            </p>
          </div>
          <span className="text-xs text-ink-600">{statusLabel[s.status]}</span>
          <span className="w-24 text-right text-[15px] tabular-nums">{formatNaira(s.total_kobo)}</span>
          {canVoid && (s.status === "paid" || s.status === "room_charge") ? <VoidSale id={s.id} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function MenuManager({ menu }: { menu: MenuItem[] }) {
  const [state, action, pending] = useActionState(addMenuItem, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <div>
      {menu.length ? (
        <ul className="divide-y divide-hairline">
          {menu.map((m) => (
            <li key={m.id} className={cn("flex min-h-14 items-center gap-3 px-5 py-2", !m.is_active && "opacity-55")}>
              <span className="flex-1 text-[15px] text-ink-900">{m.name} <span className="text-xs text-ink-500">· {OUTLETS[m.outlet]}</span></span>
              <span className="text-sm tabular-nums">{formatNaira(m.price_kobo)}</span>
              <form action={toggleMenuItem}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="active" value={m.is_active ? "0" : "1"} />
                <Button type="submit" size="sm" variant="ghost">{m.is_active ? "Take off" : "Put back"}</Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form ref={form} action={action} className="grid gap-4 border-t border-hairline p-5 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
        {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-4"><FormMessage>{state.message}</FormMessage></div> : null}
        <Field label="Item" htmlFor="mname" error={err("name")}><Input id="mname" name="name" placeholder="Chapman" required /></Field>
        <Field label="Where" htmlFor="mout"><Select id="mout" name="outlet" defaultValue="bar"><option value="bar">Bar</option><option value="restaurant">Restaurant</option></Select></Field>
        <Field label="Price (₦)" htmlFor="mprice" error={err("price")}><Input id="mprice" name="price" type="number" min={1} step="any" inputMode="decimal" required /></Field>
        <Button type="submit" pending={pending}>Add item</Button>
      </form>
    </div>
  );
}
