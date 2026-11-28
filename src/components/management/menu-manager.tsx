"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { saveMenuItem, saveMenuStock } from "@/server/pos";
import type { MenuCategory, MenuItem, Outlet } from "@/server/domain/pos";

const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
const CATEGORIES: Record<MenuCategory, string> = { meals: "Meals", snacks: "Snacks", soft_drinks: "Soft drinks", alcoholic_drinks: "Alcoholic drinks", other: "Other" };
type StockOption = { id: string; name: string; unit: string };

function ItemForm({ item, onDone }: { item?: MenuItem; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveMenuItem, null);
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      if (!item) form.current?.reset();
      onDone?.();
    }
  }, [state, item, onDone]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form ref={form} action={action} className="space-y-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field label="Name" htmlFor={`mn-${item?.id ?? "new"}`} error={err("name")}>
        <Input id={`mn-${item?.id ?? "new"}`} name="name" defaultValue={item?.name} placeholder="e.g. Jollof rice and chicken" required />
      </Field>
      <Field label="Price" htmlFor={`mp-${item?.id ?? "new"}`} error={err("price")}>
        <MoneyInput id={`mp-${item?.id ?? "new"}`} name="price" type="number" min={1} step="any" defaultValue={item ? item.price_kobo / 100 : undefined} required />
      </Field>
      <Field label="Counter" htmlFor={`mo-${item?.id ?? "new"}`}>
        <Select id={`mo-${item?.id ?? "new"}`} name="outlet" defaultValue={item?.outlet ?? "restaurant"} className="w-48">
          {Object.entries(OUTLETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Category" htmlFor={`mc-${item?.id ?? "new"}`} error={err("category")}>
        <Select id={`mc-${item?.id ?? "new"}`} name="category" defaultValue={item?.category ?? "meals"} className="w-56">
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Today" htmlFor={`ma-${item?.id ?? "new"}`}>
        <Select id={`ma-${item?.id ?? "new"}`} name="available" defaultValue={item && !item.is_available ? "0" : "1"} className="w-56">
          <option value="1">Available</option>
          <option value="0">Unavailable today</option>
        </Select>
      </Field>
      {item ? (
        <Field label="On the menu" htmlFor={`mx-${item.id}`}>
          <Select id={`mx-${item.id}`} name="active" defaultValue={item.is_active ? "1" : "0"} className="w-56">
            <option value="1">Yes</option>
            <option value="0">No, taken off</option>
          </Select>
        </Field>
      ) : null}
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <Button type="submit" pending={pending}>{item ? "Save item" : "Add to menu"}</Button>
    </form>
  );
}

function StockLinks({ item, stock }: { item: MenuItem; stock: StockOption[] }) {
  const [links, setLinks] = useState(item.links.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })));
  const [state, action, pending] = useActionState(saveMenuStock, null);
  const used = new Set(links.map((l) => l.stockItemId));
  const free = stock.filter((s) => !used.has(s.id));
  return (
    <form action={action} className="space-y-3 border-t border-hairline pt-5">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="links" value={JSON.stringify(links)} />
      <div>
        <p className="text-base font-bold text-ink-900">Stock used when one is sold</p>
        <p className="text-xs text-ink-500">e.g. one bottle of water, or 1 portion of rice and 1 piece of chicken. Taken off stock only when the sale is paid.</p>
      </div>
      {links.length ? (
        <ul className="space-y-2">
          {links.map((l, i) => {
            const s = stock.find((x) => x.id === l.stockItemId);
            return (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  type="number" min={1} max={1000} aria-label="Quantity" value={l.quantity}
                  onChange={(e) => setLinks((x) => x.map((y, j) => (j === i ? { ...y, quantity: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) } : y)))}
                  className="h-10 w-20"
                />
                <Select
                  aria-label="Stock item" value={l.stockItemId}
                  onChange={(e) => setLinks((x) => x.map((y, j) => (j === i ? { ...y, stockItemId: e.target.value } : y)))}
                  className="h-10 min-w-0 flex-1"
                >
                  {s ? <option value={s.id}>{s.name} ({s.unit})</option> : <option value="" disabled>Choose a stock item…</option>}
                  {free.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.unit})</option>)}
                </Select>
                <button type="button" aria-label="Remove" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded text-ink-500 hover:bg-ink-900/5"><Trash2 className="size-4" /></button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-ink-500">Not linked: selling it doesn&apos;t change stock.</p>}
      <div className="flex flex-wrap gap-2">
        {free.length ? (
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setLinks((x) => [...x, { stockItemId: free.find((f) => f.name.trim().toLowerCase() === item.name.trim().toLowerCase())?.id ?? "", quantity: 1 }])}
          >
            <Plus className="size-4" aria-hidden /> Link a stock item
          </Button>
        ) : null}
        <Button type="submit" size="sm" variant="secondary" pending={pending} disabled={links.some((l) => !l.stockItemId)}>Save stock links</Button>
      </div>
      {links.some((l) => !l.stockItemId) ? <p className="text-xs text-warning-700">Choose the stock item for each line before saving.</p> : null}
      {state?.ok ? <FormMessage tone="success">Stock links saved.</FormMessage> : null}
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
    </form>
  );
}

type Filter = "both" | Outlet;

/** Today's state of an item, as a word in a badge (design R203). */
function today(m: MenuItem): { tone: Tone; label: string } {
  if (!m.is_active) return { tone: "neutral", label: "Off the menu" };
  if (!m.is_available) return { tone: "warning", label: "Off today" };
  if (m.stock_left === 0) return { tone: "danger", label: "Out of stock" };
  return { tone: "success", label: "Available" };
}

export function AddMenuItem() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add menu item</Button>
      <Drawer open={open} onClose={close} title="Add menu item" subtitle="It shows on the till straight away">
        <ItemForm onDone={close} />
      </Drawer>
    </>
  );
}

export function MenuManager({ menu, stock }: { menu: MenuItem[]; stock: StockOption[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("both");
  const [q, setQ] = useState("");
  const close = useCallback(() => setEditing(null), []);
  const needle = q.trim().toLowerCase();
  const rows = menu.filter((m) => (filter === "both" || m.outlet === filter) && (!needle || m.name.toLowerCase().includes(needle)));
  const current = menu.find((m) => m.id === editing);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Counter"
          options={[{ value: "both", label: "Both" }, { value: "restaurant", label: "Restaurant" }, { value: "bar", label: "Bar" }] as const}
          value={filter}
          onChange={setFilter}
        />
        <Input type="search" aria-label="Find an item" placeholder="Find an item" value={q} onChange={(e) => setQ(e.target.value)} className="w-72 max-w-full" />
      </div>
      <section className="overflow-clip rounded-xl border border-hairline bg-white">
        <h2 className="flex items-center gap-2.5 border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">
          Menu <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-2 text-[13px] font-semibold tabular-nums text-ink-700">{rows.length}</span>
        </h2>
        {rows.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-[13px] text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Item</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Counter</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Today</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Uses from stock</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((m) => {
                  const t = today(m);
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-semibold text-ink-900">{m.name}</td>
                      <td className="px-4 py-2.5 text-ink-700">{OUTLETS[m.outlet]}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{CATEGORIES[m.category]}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-ink-900">{formatNaira(m.price_kobo)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={t.tone}>{t.label}</Badge>
                        {m.stock_left != null && m.stock_left > 0 && m.is_active && m.is_available ? <span className="mt-0.5 block whitespace-nowrap text-xs text-ink-500">{m.stock_left} can be sold</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-ink-700">{m.links.length ? m.links.map((l) => `${l.name} ${l.quantity} ${l.unit}`).join(" · ") : "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(m.id)} aria-label={`Edit ${m.name}`}>Edit</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="px-4 py-6 text-sm text-ink-500">{menu.length ? "No items match." : "Nothing on the menu yet. Add one with Add menu item."}</p>}
      </section>
      {current ? (
        <Drawer open onClose={close} title={`Edit ${current.name}`} subtitle={`${OUTLETS[current.outlet]} · ${CATEGORIES[current.category]}`} width="w-[480px]">
          <ItemForm key={current.id} item={current} onDone={close} />
          <StockLinks key={`s-${current.id}`} item={current} stock={stock} />
        </Drawer>
      ) : null}
    </div>
  );
}
