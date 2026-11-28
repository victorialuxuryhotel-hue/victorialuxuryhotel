"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { safeAction } from "@/lib/safe-action";
import { addItem, editStockItem, moveStock, receiveDelivery } from "@/server/stock";
import type { StockCategory, StockItem } from "@/server/domain/stock";

const CATEGORIES: Record<StockCategory, string> = { drinks: "Drinks", food: "Food", ingredients: "Ingredients", supplies: "Supplies", other: "Other" };

/** Adjust covers what isn't a delivery: used, damaged and count fixes. Deliveries have their own form (X12). */
type AdjustKind = "used" | "wasted" | "adjusted";
const KINDS: Record<AdjustKind, string> = { used: "Used", wasted: "Damaged / wasted", adjusted: "Count fix" };
const NOTE: Record<AdjustKind, { label: string; placeholder: string; required: boolean }> = {
  used: { label: "What for", placeholder: "e.g. Kitchen, staff meal", required: false },
  wasted: { label: "What happened", placeholder: "e.g. 2 bottles broken", required: true },
  adjusted: { label: "Why", placeholder: "e.g. Counted 46", required: true },
};

export function stockStatus(i: Pick<StockItem, "quantity" | "min_quantity">): { tone: "success" | "warning" | "danger"; label: string } {
  if (i.quantity <= 0) return { tone: "danger", label: "Out" };
  if (i.quantity <= i.min_quantity) return { tone: "warning", label: "Low" };
  return { tone: "success", label: "OK" };
}

/** Closes the drawer once an action succeeds (each success is a new state object). */
function useDoneOnSuccess(state: { ok: boolean } | null, onDone: () => void) {
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onDone();
    }
  }, [state, onDone]);
}

function AdjustDrawer({ item, open, onClose }: { item: StockItem; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<AdjustKind>("used");
  const [qty, setQty] = useState("");
  const [state, action, pending] = useActionState(safeAction(moveStock), null);
  const [editState, editAction, editPending] = useActionState(safeAction(editStockItem), null);
  useDoneOnSuccess(state, onClose);
  useDoneOnSuccess(editState, onClose);
  const n = Number(qty);
  const change = !qty || !Number.isInteger(n) ? null : kind === "adjusted" ? n : -Math.abs(n);
  const formId = `adjust-${item.id}`;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Adjust ${item.name}`}
      subtitle={`${item.quantity} ${item.unit} in stock`}
      footer={<Button type="submit" form={formId} size="lg" className="w-full" pending={pending}>Save</Button>}
    >
      <form id={formId} action={action} className="space-y-4">
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="kind" value={kind} />
        <Segmented label="What happened" options={(Object.keys(KINDS) as AdjustKind[]).map((k) => ({ value: k, label: KINDS[k] }))} value={kind} onChange={setKind} />
        <Field
          label={kind === "adjusted" ? "Change (+ or −)" : "Quantity"}
          htmlFor={`${formId}-qty`}
          hint={change !== null ? `In ${item.unit}. Stock goes from ${item.quantity} to ${item.quantity + change}` : `In ${item.unit}.`}
        >
          <Input id={`${formId}-qty`} name="quantity" type="number" inputMode="numeric" min={kind === "adjusted" ? undefined : 1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-32 tabular-nums" required />
        </Field>
        <Field label={NOTE[kind].label} htmlFor={`${formId}-note`} optional={!NOTE[kind].required}>
          <Input id={`${formId}-note`} name="note" placeholder={NOTE[kind].placeholder} maxLength={200} required={NOTE[kind].required} minLength={NOTE[kind].required ? 3 : undefined} />
        </Field>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      </form>

      <form action={editAction} className="space-y-4 border-t border-hairline pt-5">
        <p className="text-base font-bold text-ink-900">Item settings</p>
        <input type="hidden" name="id" value={item.id} />
        <Field label="Category" htmlFor={`${formId}-cat`}>
          <Select id={`${formId}-cat`} name="category" defaultValue={item.category} className="w-48">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Low at" htmlFor={`${formId}-min`} hint="The till and this page warn at or below this.">
          <Input id={`${formId}-min`} name="minQuantity" type="number" min={0} defaultValue={item.min_quantity} className="w-32 tabular-nums" />
        </Field>
        <Field label="Tracking" htmlFor={`${formId}-active`}>
          <Select id={`${formId}-active`} name="active" defaultValue="1" className="w-48"><option value="1">Keep</option><option value="0">Stop tracking</option></Select>
        </Field>
        {editState && !editState.ok ? <FormMessage>{editState.message}</FormMessage> : null}
        <Button type="submit" variant="secondary" pending={editPending}>Save settings</Button>
      </form>
    </Drawer>
  );
}

export function StockTable({ items, manage }: { items: StockItem[]; manage: boolean }) {
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const close = useCallback(() => setAdjusting(null), []);
  if (!items.length) return <p className="px-5 py-6 text-sm text-ink-500">No stock items yet.{manage ? " Add one with Add stock item." : ""}</p>;
  const current = items.find((i) => i.id === adjusting);
  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-[13px] text-ink-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Item</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">In stock</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Low at</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              {manage ? <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {items.map((i) => {
              const st = stockStatus(i);
              return (
                <tr key={i.id}>
                  <td className="px-4 py-2.5 font-semibold text-ink-900">{i.name}</td>
                  <td className="px-4 py-2.5 text-ink-700">{CATEGORIES[i.category]}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-900">{i.quantity.toLocaleString("en-NG")} {i.unit}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-900">{i.min_quantity.toLocaleString("en-NG")}</td>
                  <td className="px-4 py-2.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                  {manage ? (
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setAdjusting(i.id)} aria-label={`Adjust ${i.name}`}>Adjust</Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {current ? <AdjustDrawer key={current.id} item={current} open onClose={close} /> : null}
    </>
  );
}

/** Record a delivery (X12): adds to stock and to the history, with who supplied it and what it cost. */
export function RecordDelivery({ items, variant = "secondary" }: { items: StockItem[]; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [state, action, pending] = useActionState(safeAction(receiveDelivery), null);
  const done = useCallback(() => {
    setOpen(false);
    setQty("");
  }, []);
  useDoneOnSuccess(state, done);
  const item = items.find((i) => i.id === itemId);
  const n = Number(qty);
  const valid = qty !== "" && Number.isInteger(n) && n > 0;
  const err = (f: string) => (state && !state.ok ? state.fieldErrors?.[f]?.[0] : undefined);
  if (!items.length) return null;
  return (
    <>
      <Button variant={variant} size={variant === "primary" ? "md" : "sm"} onClick={() => setOpen(true)}>Record a delivery</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Record a delivery"
        subtitle="Adds to stock and to the history"
        footer={
          <Button type="submit" form="record-delivery" size="lg" className="w-full" pending={pending}>
            {valid && item ? `Add ${n.toLocaleString("en-NG")} ${item.unit}` : "Add to stock"}
          </Button>
        }
      >
        <form id="record-delivery" action={action} className="space-y-4">
          <Field label="Item" htmlFor="dl-item" error={err("itemId")}>
            <Select id="dl-item" name="itemId" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <Field
            label="Quantity received"
            htmlFor="dl-qty"
            error={err("quantity")}
            hint={item ? (valid ? `In ${item.unit}. Stock goes from ${item.quantity.toLocaleString("en-NG")} to ${(item.quantity + n).toLocaleString("en-NG")}` : `In ${item.unit}. Now ${item.quantity.toLocaleString("en-NG")}`) : undefined}
          >
            <Input id="dl-qty" name="quantity" type="number" inputMode="numeric" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-32 tabular-nums" required />
          </Field>
          <Field label="Supplier" htmlFor="dl-supplier" error={err("supplier")}>
            <Input id="dl-supplier" name="supplier" placeholder="e.g. Nigerian Breweries depot" minLength={2} maxLength={80} autoComplete="off" required />
          </Field>
          <Field label="Cost" htmlFor="dl-cost" optional error={err("cost")}>
            <MoneyInput id="dl-cost" name="cost" placeholder="0" autoComplete="off" />
          </Field>
          <Field label="Note" htmlFor="dl-note" error={err("note")}>
            <Input id="dl-note" name="note" placeholder="e.g. Invoice NB-22871" maxLength={200} autoComplete="off" />
          </Field>
          {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
        </form>
      </Drawer>
    </>
  );
}

export function AddStockItem() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(safeAction(addItem), null);
  const done = useCallback(() => setOpen(false), []);
  useDoneOnSuccess(state, done);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add stock item</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add stock item"
        subtitle="Something the restaurant or bar keeps a count of"
        footer={<Button type="submit" form="add-stock-item" size="lg" className="w-full" pending={pending}>Add item</Button>}
      >
        <form id="add-stock-item" action={action} className="space-y-4">
          <Field label="Item" htmlFor="sname" error={err("name")}><Input id="sname" name="name" placeholder="Star lager" required /></Field>
          <Field label="Category" htmlFor="scat"><Select id="scat" name="category" defaultValue="drinks" className="w-48">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Unit" htmlFor="sunit" error={err("unit")}><Input id="sunit" name="unit" placeholder="bottles" className="w-40" required /></Field>
          <Field label="In stock now" htmlFor="sopen"><Input id="sopen" name="opening" type="number" min={0} defaultValue={0} className="w-32 tabular-nums" /></Field>
          <Field label="Low at" htmlFor="smin"><Input id="smin" name="minQuantity" type="number" min={0} defaultValue={0} className="w-32 tabular-nums" /></Field>
          {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
        </form>
      </Drawer>
    </>
  );
}
