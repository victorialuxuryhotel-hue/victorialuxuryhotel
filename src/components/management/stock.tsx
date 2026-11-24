"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { addItem, editStockItem, moveStock } from "@/server/stock";
import type { ManualKind, StockCategory, StockItem } from "@/server/domain/stock";

const KINDS: Record<ManualKind, string> = { received: "Received", used: "Used", wasted: "Damaged / wasted", adjusted: "Count fix" };
const CATEGORIES: Record<StockCategory, string> = { drinks: "Drinks", food: "Food", ingredients: "Ingredients", supplies: "Supplies", other: "Other" };
const NOTE: Record<ManualKind, string> = { received: "Supplier or note", used: "What for (optional)", wasted: "What happened? e.g. 2 broken", adjusted: "Why? e.g. counted 46" };

function MoveForm({ item }: { item: StockItem }) {
  const [kind, setKind] = useState<ManualKind>("received");
  const [state, action, pending] = useActionState(moveStock, null);
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      form.current?.reset();
    }
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap gap-1">
        {(Object.keys(KINDS) as ManualKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={cn("min-h-10 rounded-full border px-3 text-xs", kind === k ? "border-navy-800 bg-navy-50 text-navy-800" : "border-hairline")}>{KINDS[k]}</button>
        ))}
      </div>
      <Input name="quantity" type="number" inputMode="numeric" placeholder={kind === "adjusted" ? "+ / −" : "Qty"} aria-label={`${KINDS[kind]} quantity`} className="h-10 w-20" required />
      <Input name="note" placeholder={NOTE[kind]} aria-label="Note" className="h-10 min-w-0 flex-1 sm:w-48 sm:flex-none" required={kind === "adjusted" || kind === "wasted"} minLength={kind === "adjusted" || kind === "wasted" ? 3 : undefined} />
      <Button type="submit" size="sm" className="h-10" pending={pending}>Save</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
      {state?.ok ? <p className="w-full text-xs text-success-700">Saved.</p> : null}
    </form>
  );
}

function EditItem({ item, onDone }: { item: StockItem; onDone: () => void }) {
  const [state, action, pending] = useActionState(editStockItem, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={item.id} />
      <label className="text-xs text-ink-600">Category
        <Select name="category" defaultValue={item.category} className="mt-1 h-10">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </label>
      <label className="text-xs text-ink-600">Low at
        <Input name="minQuantity" type="number" min={0} defaultValue={item.min_quantity} className="mt-1 h-10 w-24" />
      </label>
      <label className="text-xs text-ink-600">Tracking
        <Select name="active" defaultValue="1" className="mt-1 h-10"><option value="1">Keep</option><option value="0">Stop tracking</option></Select>
      </label>
      <Button type="submit" size="sm" className="h-10" pending={pending}>Save</Button>
      <Button type="button" size="sm" variant="ghost" className="h-10" onClick={onDone}>Close</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

export function StockList({ items, manage }: { items: StockItem[]; manage: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!items.length) return <p className="px-5 py-6 text-sm text-ink-500">No stock items yet.{manage ? " Add one below." : ""}</p>;
  return (
    <ul className="divide-y divide-hairline">
      {items.map((i) => {
        const low = i.quantity <= i.min_quantity;
        return (
          <li key={i.id} className="space-y-3 px-5 py-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink-900">{i.name} <span className="text-xs text-ink-500">· {CATEGORIES[i.category]}</span></p>
                <p className="text-xs text-ink-500">Low at {i.min_quantity} · updated {i.last_update ? formatDate(i.last_update.slice(0, 10), { year: false }) : "never"}</p>
              </div>
              <p className={cn("text-base font-semibold tabular-nums", low ? "text-danger-700" : "text-ink-900")}>{i.quantity} {i.unit}{low ? " · low" : ""}</p>
              {manage ? <Button size="sm" variant="ghost" onClick={() => setEditing(editing === i.id ? null : i.id)}>{editing === i.id ? "Close" : "Edit"}</Button> : null}
            </div>
            {manage ? (editing === i.id ? <EditItem item={i} onDone={() => setEditing(null)} /> : <MoveForm item={i} />) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AddStockItem() {
  const [state, action, pending] = useActionState(addItem, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form ref={form} action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_9rem_8rem_8rem_8rem_auto] lg:items-end">
      {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-2 lg:col-span-6"><FormMessage>{state.message}</FormMessage></div> : null}
      {state?.ok ? <div className="sm:col-span-2 lg:col-span-6"><FormMessage tone="success">Added.</FormMessage></div> : null}
      <Field label="Item" htmlFor="sname" error={err("name")}><Input id="sname" name="name" placeholder="Star lager" required /></Field>
      <Field label="Category" htmlFor="scat"><Select id="scat" name="category" defaultValue="drinks">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Unit" htmlFor="sunit" error={err("unit")}><Input id="sunit" name="unit" placeholder="bottles" required /></Field>
      <Field label="In stock now" htmlFor="sopen"><Input id="sopen" name="opening" type="number" min={0} defaultValue={0} /></Field>
      <Field label="Low at" htmlFor="smin"><Input id="smin" name="minQuantity" type="number" min={0} defaultValue={0} /></Field>
      <Button type="submit" pending={pending}>Add item</Button>
    </form>
  );
}
