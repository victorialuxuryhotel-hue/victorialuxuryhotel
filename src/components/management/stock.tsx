"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";
import { addItem, moveStock } from "@/server/stock";
import type { MoveKind, StockItem } from "@/server/domain/stock";

const KINDS: Record<MoveKind, string> = { used: "Used", received: "Received", adjusted: "Count fix" };

function MoveForm({ item, manage }: { item: StockItem; manage: boolean }) {
  const kinds = manage ? (["used", "received", "adjusted"] as MoveKind[]) : (["used"] as MoveKind[]);
  const [kind, setKind] = useState<MoveKind>("used");
  const [state, action, pending] = useActionState(moveStock, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="kind" value={kind} />
      {kinds.length > 1 ? (
        <div className="flex gap-1">
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
              className={cn("min-h-11 rounded-full border px-3 text-xs", kind === k ? "border-navy-800 bg-navy-50 text-navy-800" : "border-hairline")}>{KINDS[k]}</button>
          ))}
        </div>
      ) : null}
      <Input name="quantity" type="number" inputMode="numeric" placeholder={kind === "adjusted" ? "+/−" : "Qty"} aria-label={`${KINDS[kind]} quantity`} className="h-11 w-20" required />
      {kind !== "used" ? <Input name="note" placeholder={kind === "adjusted" ? "Why?" : "Supplier / note"} aria-label="Note" className="h-11 min-w-0 flex-1 sm:w-40 sm:flex-none" required={kind === "adjusted"} /> : null}
      <Button type="submit" size="sm" className="h-11" pending={pending}>Save</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

export function StockList({ items, manage }: { items: StockItem[]; manage: boolean }) {
  if (!items.length) return <p className="px-5 py-6 text-sm text-ink-500">No stock items yet.{manage ? " Add one below." : ""}</p>;
  return (
    <ul className="divide-y divide-hairline">
      {items.map((i) => {
        const low = i.quantity <= i.min_quantity;
        return (
          <li key={i.id} className="space-y-2 px-5 py-3 sm:flex sm:items-center sm:gap-4 sm:space-y-0">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-ink-900">{i.name}</p>
              <p className={cn("text-sm tabular-nums", low ? "text-danger-700" : "text-ink-600")}>
                {i.quantity} {i.unit}{low ? ` · low (reorder at ${i.min_quantity})` : ""}
              </p>
            </div>
            <MoveForm item={i} manage={manage} />
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
    <form ref={form} action={action} className="grid gap-4 p-5 sm:grid-cols-[1fr_8rem_8rem_8rem_auto] sm:items-end">
      {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-5"><FormMessage>{state.message}</FormMessage></div> : null}
      <Field label="Item" htmlFor="sname" error={err("name")}><Input id="sname" name="name" placeholder="Star lager" required /></Field>
      <Field label="Unit" htmlFor="sunit" error={err("unit")}><Input id="sunit" name="unit" placeholder="bottles" required /></Field>
      <Field label="In stock now" htmlFor="sopen"><Input id="sopen" name="opening" type="number" min={0} defaultValue={0} /></Field>
      <Field label="Low at" htmlFor="smin"><Input id="smin" name="minQuantity" type="number" min={0} defaultValue={0} /></Field>
      <Button type="submit" pending={pending}>Add item</Button>
    </form>
  );
}
