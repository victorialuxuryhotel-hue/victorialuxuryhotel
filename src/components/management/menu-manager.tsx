"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
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
    <form ref={form} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field label="Name" htmlFor={`mn-${item?.id ?? "new"}`} error={err("name")} className="lg:col-span-2">
        <Input id={`mn-${item?.id ?? "new"}`} name="name" defaultValue={item?.name} placeholder="e.g. Jollof rice and chicken" required />
      </Field>
      <Field label="Price (₦)" htmlFor={`mp-${item?.id ?? "new"}`} error={err("price")}>
        <Input id={`mp-${item?.id ?? "new"}`} name="price" type="number" min={1} step="any" inputMode="decimal" defaultValue={item ? item.price_kobo / 100 : undefined} required />
      </Field>
      <Field label="Counter" htmlFor={`mo-${item?.id ?? "new"}`}>
        <Select id={`mo-${item?.id ?? "new"}`} name="outlet" defaultValue={item?.outlet ?? "restaurant"}>
          {Object.entries(OUTLETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Category" htmlFor={`mc-${item?.id ?? "new"}`} error={err("category")}>
        <Select id={`mc-${item?.id ?? "new"}`} name="category" defaultValue={item?.category ?? "meals"}>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Today" htmlFor={`ma-${item?.id ?? "new"}`}>
        <Select id={`ma-${item?.id ?? "new"}`} name="available" defaultValue={item && !item.is_available ? "0" : "1"}>
          <option value="1">Available</option>
          <option value="0">Unavailable today</option>
        </Select>
      </Field>
      {item ? (
        <Field label="On the menu" htmlFor={`mx-${item.id}`}>
          <Select id={`mx-${item.id}`} name="active" defaultValue={item.is_active ? "1" : "0"}>
            <option value="1">Yes</option>
            <option value="0">No, taken off</option>
          </Select>
        </Field>
      ) : null}
      <div className="flex items-end gap-2">
        <Button type="submit" pending={pending}>{item ? "Save" : "Add to menu"}</Button>
        {onDone && item ? <Button type="button" variant="ghost" onClick={onDone}>Close</Button> : null}
      </div>
      {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-2 lg:col-span-4"><FormMessage>{state.message}</FormMessage></div> : null}
      {state?.ok && !item ? <div className="sm:col-span-2 lg:col-span-4"><FormMessage tone="success">Added to the menu.</FormMessage></div> : null}
    </form>
  );
}

function StockLinks({ item, stock }: { item: MenuItem; stock: StockOption[] }) {
  const [links, setLinks] = useState(item.links.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })));
  const [state, action, pending] = useActionState(saveMenuStock, null);
  const used = new Set(links.map((l) => l.stockItemId));
  const free = stock.filter((s) => !used.has(s.id));
  return (
    <form action={action} className="space-y-3 rounded-md bg-white p-4">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="links" value={JSON.stringify(links)} />
      <div>
        <p className="text-sm font-medium text-ink-900">Stock used when one is sold</p>
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

export function MenuManager({ menu, stock }: { menu: MenuItem[]; stock: StockOption[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const groups = (Object.keys(OUTLETS) as Outlet[]).map((o) => ({ outlet: o, items: menu.filter((m) => m.outlet === o) }));
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.outlet} className="rounded-card border border-hairline bg-ivory-50">
          <h2 className="border-b border-hairline px-5 py-4 font-display text-xl text-navy-950">{OUTLETS[g.outlet]} · {g.items.filter((i) => i.is_active).length} on the menu</h2>
          {g.items.length ? (
            <ul className="divide-y divide-hairline">
              {g.items.map((m) => (
                <li key={m.id} className={cn("px-5 py-3", !m.is_active && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink-900">{m.name}</p>
                      <p className="text-xs text-ink-500">
                        {CATEGORIES[m.category]}
                        {!m.is_active ? " · taken off the menu" : !m.is_available ? " · unavailable today" : ""}
                        {m.links.length ? ` · uses ${m.links.map((l) => `${l.quantity} ${l.unit} ${l.name}`).join(", ")}` : " · no stock link"}
                        {m.stock_left != null ? ` · ${m.stock_left} can be sold` : ""}
                      </p>
                    </div>
                    <span className="text-[15px] tabular-nums">{formatNaira(m.price_kobo)}</span>
                    <Button size="sm" variant={editing === m.id ? "secondary" : "ghost"} onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? "Close" : "Edit"}</Button>
                  </div>
                  {editing === m.id ? (
                    <div className="mt-4 space-y-4">
                      <ItemForm item={m} onDone={() => setEditing(null)} />
                      <StockLinks item={m} stock={stock} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-4 text-sm text-ink-500">Nothing on this menu yet.</p>}
        </section>
      ))}
      <section className="rounded-card border border-hairline bg-ivory-50 p-5">
        <h2 className="mb-4 font-display text-xl text-navy-950">Add a menu item</h2>
        <ItemForm />
      </section>
    </div>
  );
}
