"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { cancelOpenOrder, saveOpenOrder, takePayment } from "@/server/pos";
import { OFFLINE_MESSAGE, safeAction } from "@/lib/safe-action";
import type { MenuCategory, MenuItem, OpenOrder, Outlet, PayMethod } from "@/server/domain/pos";
import { PosReceipt, type PosReceiptData } from "./pos-receipt";

const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
const CATEGORIES: Record<MenuCategory, string> = { meals: "Meals", snacks: "Snacks", soft_drinks: "Soft drinks", alcoholic_drinks: "Alcoholic drinks", other: "Other" };
const METHODS: Record<PayMethod, string> = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS / card" };
const chip = (on: boolean) =>
  cn("inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-sm whitespace-nowrap", on ? "border-navy-800 bg-navy-800 text-white" : "border-hairline bg-ivory-50 text-ink-900 hover:bg-ink-900/7");
const toKobo = (naira: string) => Math.round(Number(naira.replace(/[^\d.]/g, "")) * 100);

type Step = "order" | "pay" | "done";

const OFFLINE = `${OFFLINE_MESSAGE} If the internet stays down, use a numbered paper slip.`;
const saveSafe = safeAction(saveOpenOrder, OFFLINE);
const paySafe = safeAction(takePayment, OFFLINE);
const cancelSafe = safeAction(cancelOpenOrder, OFFLINE);

export function Till({ menu, open, attendant, vatRateBp, startOutlet = "bar", resume }: {
  menu: MenuItem[]; open: OpenOrder[]; attendant: string; vatRateBp: number; startOutlet?: Outlet; resume?: string;
}) {
  const resumeOrder = open.find((o) => o.id === resume);
  const [outlet, setOutlet] = useState<Outlet>(resumeOrder?.outlet ?? startOutlet);
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>(() => Object.fromEntries((resumeOrder?.lines ?? []).map((l) => [l.menuItemId, l.quantity])));
  const [note, setNote] = useState(resumeOrder?.note ?? "");
  const [editing, setEditing] = useState<{ id: string; number: number } | null>(resumeOrder ? { id: resumeOrder.id, number: resumeOrder.number } : null);
  const [step, setStep] = useState<Step>("order");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [given, setGiven] = useState("");
  const [receipt, setReceipt] = useState<PosReceiptData | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [saveState, saveAction, saving] = useActionState(saveSafe, null);
  const [payState, payAction, paying] = useActionState(paySafe, null);
  const orderId = useRef<string>(resumeOrder?.id ?? "");
  const stampId = (e: React.FormEvent<HTMLFormElement>) => {
    if (!orderId.current) orderId.current = crypto.randomUUID();
    const input = e.currentTarget.elements.namedItem("id") as HTMLInputElement | null;
    if (input) input.value = orderId.current;
  };

  const items = menu.filter((m) => m.outlet === outlet && m.is_active);
  const categories = [...new Set(items.map((m) => m.category))];
  const shown = items.filter((m) => category === "all" || m.category === category);
  const lines = useMemo(
    () => Object.entries(cart).map(([id, q]) => ({ item: menu.find((m) => m.id === id)!, q })).filter((l) => l.item && l.q > 0),
    [cart, menu],
  );
  const total = lines.reduce((s, l) => s + l.item.price_kobo * l.q, 0);
  const count = lines.reduce((s, l) => s + l.q, 0);
  const givenKobo = given ? toKobo(given) : null;
  const change = givenKobo != null ? givenKobo - total : null;
  const maxFor = (m: MenuItem) => Math.min(99, m.stock_left ?? 99);

  const reset = () => {
    orderId.current = "";
    setCart({});
    setNote("");
    setEditing(null);
    setGiven("");
    setMethod("cash");
    setStep("order");
  };
  const add = (m: MenuItem, d: number) => setCart((c) => ({ ...c, [m.id]: Math.max(0, Math.min(maxFor(m), (c[m.id] ?? 0) + d)) }));
  const linesJson = JSON.stringify(lines.map((l) => ({ menuItemId: l.item.id, quantity: l.q })));

  const handledSave = useRef<unknown>(null);
  useEffect(() => {
    if (saveState?.ok && handledSave.current !== saveState) {
      handledSave.current = saveState;
      reset();
    }
  }, [saveState]);
  const handledPay = useRef<unknown>(null);
  const snapshot = useRef<PosReceiptData | null>(null);
  useEffect(() => {
    if (payState?.ok && handledPay.current !== payState && snapshot.current) {
      handledPay.current = payState;
      setReceipt({ ...snapshot.current, receiptNumber: payState.data.receiptNumber, orderNumber: payState.data.number, paidAt: new Date().toISOString(), totalKobo: payState.data.totalKobo });
      setAlreadyPaid(payState.data.alreadyPaid);
      setStep("done");
    }
  }, [payState]);

  const resumeOpen = (o: OpenOrder) => {
    setOutlet(o.outlet);
    setCategory("all");
    setCart(Object.fromEntries(o.lines.map((l) => [l.menuItemId, l.quantity])));
    setNote(o.note ?? "");
    setEditing({ id: o.id, number: o.number });
    orderId.current = o.id;
    setStep("order");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (step === "done" && receipt) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-2">
        <div className="flex items-center gap-3 rounded-card border border-success-600/30 bg-success-50 p-4 print:hidden" role="status">
          <CheckCircle2 className="size-6 shrink-0 text-success-700" aria-hidden />
          <div>
            <p className="font-semibold text-ink-900">{alreadyPaid ? "This order was already paid." : "Paid"}: {formatNaira(receipt.totalKobo)}</p>
            {receipt.method === "cash" && receipt.cashReceivedKobo != null ? (
              <p className="text-lg font-semibold text-success-700">Give change: {formatNaira(receipt.cashReceivedKobo - receipt.totalKobo)}</p>
            ) : (
              <p className="text-sm text-ink-600">{METHODS[receipt.method]}</p>
            )}
          </div>
        </div>
        <PosReceipt r={receipt} />
        <div className="grid grid-cols-2 gap-3 print:hidden">
          <Button variant="secondary" size="lg" onClick={() => window.print()}><Printer className="size-4" aria-hidden /> Print receipt</Button>
          <Button size="lg" onClick={() => { setReceipt(null); reset(); }}>New order</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Menu" className="min-w-0 space-y-4">
          <div className="flex gap-2" role="tablist" aria-label="Counter">
            {(Object.keys(OUTLETS) as Outlet[]).map((o) => (
              <button
                key={o}
                type="button"
                role="tab"
                aria-selected={o === outlet}
                disabled={!!editing && o !== outlet}
                onClick={() => { if (o !== outlet) { setOutlet(o); setCategory("all"); setCart({}); } }}
                className={cn(chip(o === outlet), "px-5 text-base disabled:opacity-40")}
              >
                {OUTLETS[o]}
              </button>
            ))}
          </div>
          {categories.length > 1 ? (
            <nav aria-label="Category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={chip(category === "all")}>All</button>
              {categories.map((c) => (
                <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={chip(category === c)}>{CATEGORIES[c]}</button>
              ))}
            </nav>
          ) : null}
          {shown.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((m) => {
                const out = m.stock_left === 0;
                const off = !m.is_available || out;
                const inCart = cart[m.id] ?? 0;
                const full = inCart >= maxFor(m);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={off || full}
                      onClick={() => add(m, 1)}
                      className={cn(
                        "relative flex min-h-24 w-full flex-col items-start justify-between rounded-md border p-3 text-left transition-colors",
                        inCart ? "border-navy-800 bg-navy-50" : "border-hairline bg-ivory-50 hover:bg-ink-900/4",
                        off && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="text-[15px] leading-snug text-ink-900">{m.name}</span>
                      <span className="mt-2 flex w-full items-end justify-between gap-2">
                        <span className="text-sm tabular-nums text-ink-700">{formatNaira(m.price_kobo)}</span>
                        {inCart ? <span className="rounded-full bg-navy-800 px-2 text-sm font-semibold tabular-nums text-white">{inCart}</span> : null}
                      </span>
                      {!m.is_available ? (
                        <span className="mt-1 text-xs font-medium text-ink-600">Unavailable today</span>
                      ) : out ? (
                        <span className="mt-1 text-xs font-medium text-danger-700">Out of stock</span>
                      ) : m.stock_left != null && m.stock_left <= 5 ? (
                        <span className="mt-1 text-xs text-warning-700">{m.stock_left} left</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-hairline p-6 text-sm text-ink-500">No {OUTLETS[outlet].toLowerCase()} items on the menu yet. A manager adds them under Menu.</p>
          )}
        </section>

        <section id="order" aria-label="This order" className="h-fit space-y-4 rounded-card border border-hairline bg-ivory-50 p-5 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl text-navy-950">{editing ? `Order #${editing.number}` : "New order"}</h2>
            {lines.length ? <button type="button" onClick={reset} className="text-sm text-ink-500 underline-offset-2 hover:underline">Clear</button> : null}
          </div>
          {saveState && !saveState.ok ? <FormMessage>{saveState.message}</FormMessage> : null}
          {payState && !payState.ok ? <FormMessage>{payState.message}</FormMessage> : null}
          {saveState?.ok && !lines.length ? <FormMessage tone="success">Order #{saveState.data.number} saved as unpaid.</FormMessage> : null}

          {lines.length ? (
            <ul className="divide-y divide-hairline">
              {lines.map((l) => (
                <li key={l.item.id} className="py-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[15px] text-ink-900">{l.item.name}</span>
                    <span className="shrink-0 text-[15px] tabular-nums text-ink-900">{formatNaira(l.item.price_kobo * l.q)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="mr-auto text-xs tabular-nums text-ink-500">{formatNaira(l.item.price_kobo)} each</span>
                    <button type="button" aria-label={`Remove ${l.item.name}`} onClick={() => add(l.item, -l.q)} className="flex size-10 items-center justify-center rounded text-ink-500 hover:bg-ink-900/5"><Trash2 className="size-4" /></button>
                    <button type="button" aria-label={`One less ${l.item.name}`} onClick={() => add(l.item, -1)} className="flex size-10 items-center justify-center rounded border border-hairline text-navy-700"><Minus className="size-4" /></button>
                    <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">{l.q}</span>
                    <button type="button" aria-label={`One more ${l.item.name}`} disabled={l.q >= maxFor(l.item)} onClick={() => add(l.item, 1)} className="flex size-10 items-center justify-center rounded border border-hairline text-navy-700 disabled:opacity-40"><Plus className="size-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">Tap items on the menu to add them.</p>
          )}

          <div className="flex items-baseline justify-between border-t border-hairline pt-3">
            <span className="text-ink-700">Total{count ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}</span>
            <span className="font-display text-3xl tabular-nums text-navy-950">{formatNaira(total)}</span>
          </div>

          {step === "order" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-[13px] text-ink-700">Table or customer <span className="text-ink-400">(optional)</span></span>
                <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="e.g. Table 4" />
              </label>
              <div className="grid gap-2">
                <Button size="lg" disabled={!lines.length} onClick={() => setStep("pay")}>Take payment</Button>
                <form action={saveAction} onSubmit={stampId}>
                  <input type="hidden" name="id" defaultValue="" />
                  <input type="hidden" name="outlet" value={outlet} />
                  <input type="hidden" name="lines" value={linesJson} />
                  <input type="hidden" name="note" value={note} />
                  <Button type="submit" variant="secondary" className="w-full" pending={saving} disabled={!lines.length}>
                    {editing ? "Save changes (still unpaid)" : "Save as unpaid order"}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <form
              action={payAction}
              onSubmit={(e) => {
                stampId(e);
                snapshot.current = {
                  outlet, receiptNumber: "", orderNumber: 0, paidAt: "", attendant, vatRateBp,
                  lines: lines.map((l) => ({ name: l.item.name, quantity: l.q, unitKobo: l.item.price_kobo })),
                  totalKobo: total, method, cashReceivedKobo: method === "cash" ? givenKobo : null,
                };
              }}
              className="space-y-4"
            >
              <input type="hidden" name="id" defaultValue="" />
              <input type="hidden" name="outlet" value={outlet} />
              <input type="hidden" name="lines" value={linesJson} />
              <input type="hidden" name="note" value={note} />
              <input type="hidden" name="method" value={method} />
              <fieldset>
                <legend className="mb-2 text-[13px] text-ink-700">How is the customer paying?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(METHODS) as PayMethod[]).map((k) => (
                    <button key={k} type="button" aria-pressed={method === k} onClick={() => setMethod(k)} className={cn(chip(method === k), "rounded-md px-2")}>{METHODS[k]}</button>
                  ))}
                </div>
              </fieldset>
              {method === "cash" ? (
                <div className="space-y-2 rounded-md bg-white p-3">
                  <label className="block">
                    <span className="mb-1 block text-[13px] text-ink-700">Customer gave (₦)</span>
                    <Input name="cashReceived" inputMode="decimal" value={given} onChange={(e) => setGiven(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(total / 100)} className="text-lg tabular-nums" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[total, Math.ceil(total / 100_000) * 100_000, Math.ceil(total / 500_000) * 500_000, Math.ceil(total / 1_000_000) * 1_000_000]
                      .filter((v, i, a) => v >= total && a.indexOf(v) === i)
                      .slice(0, 4)
                      .map((v) => (
                        <button key={v} type="button" onClick={() => setGiven(String(v / 100))} className="rounded-full border border-hairline px-3 py-1.5 text-sm tabular-nums hover:bg-ink-900/5">
                          {v === total ? "Exact" : formatNaira(v)}
                        </button>
                      ))}
                  </div>
                  <p className={cn("flex justify-between text-lg font-semibold tabular-nums", change != null && change < 0 ? "text-danger-700" : "text-success-700")}>
                    <span>{change != null && change < 0 ? "Still to pay" : "Change"}</span>
                    <span>{change == null ? "–" : formatNaira(Math.abs(change))}</span>
                  </p>
                </div>
              ) : null}
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button type="button" variant="secondary" size="lg" onClick={() => setStep("order")}>Back</Button>
                <Button type="submit" size="lg" pending={paying} disabled={!lines.length || (method === "cash" && change != null && change < 0)}>
                  Confirm {formatNaira(total)} paid
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>

      {open.length ? (
        <section aria-labelledby="unpaid" className="rounded-card border border-hairline bg-ivory-50">
          <h2 id="unpaid" className="border-b border-hairline px-5 py-4 font-display text-xl text-navy-950">Unpaid orders · {open.length}</h2>
          <ul className="divide-y divide-hairline">
            {open.map((o) => <OpenOrderRow key={o.id} o={o} onOpen={() => resumeOpen(o)} active={editing?.id === o.id} />)}
          </ul>
        </section>
      ) : null}

      {step === "order" && lines.length ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-ivory-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden print:hidden">
          <a href="#order" className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-700">{count} item{count === 1 ? "" : "s"}</span>
            <span className="rounded-md bg-navy-800 px-4 py-2.5 font-semibold tabular-nums text-white">Review {formatNaira(total)}</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}

function OpenOrderRow({ o, onOpen, active }: { o: OpenOrder; onOpen: () => void; active: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState(cancelSafe, null);
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3", active && "bg-navy-50")}>
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        <p className="text-[15px] text-ink-900">#{o.number} · {OUTLETS[o.outlet]}{o.note ? ` · ${o.note}` : ""}</p>
        <p className="truncate text-xs text-ink-500">{o.items} · by {o.created_by_name ?? "staff"}</p>
      </div>
      <span className="mr-auto text-[15px] font-semibold tabular-nums sm:mr-0">{formatNaira(o.total_kobo)}</span>
      {confirm ? (
        <form action={action} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input type="hidden" name="id" value={o.id} />
          <Input name="reason" placeholder="Why? (optional)" className="h-10 min-w-0 flex-1 text-sm sm:w-44" />
          <Button type="submit" size="sm" variant="danger" pending={pending}>Cancel order</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
          {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
        </form>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Cancel</Button>
          <Button size="sm" onClick={onOpen}>{active ? "Open now" : "Open"}</Button>
        </div>
      )}
    </li>
  );
}

