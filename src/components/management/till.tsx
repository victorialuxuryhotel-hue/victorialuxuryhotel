"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, MessageSquare, Minus, Plus, Printer, Repeat2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { Segmented, Tabs } from "@/components/ui/choice";
import { Popover } from "@/components/ui/popover";
import { requestLock } from "./idle-lock";
import { BankLine, type PaySettings } from "./offline-payment-form";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { cancelOpenOrder, reportTillDebit, saveOpenOrder, takePayment } from "@/server/pos";
import { OFFLINE_MESSAGE, safeAction } from "@/lib/safe-action";
import type { MenuCategory, MenuItem, OpenOrder, Outlet, PayMethod } from "@/server/domain/pos";
import { NumPad } from "@/components/ui/num-pad";
import { shouldAutoPrint } from "@/lib/station";
import { useStationConfigured } from "./thermal";
import { OFFLINE_REASON, useOnline } from "./connection";
import { useStation } from "./use-station";
import { PosReceipt, type PosReceiptData } from "./pos-receipt";

const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
const CATEGORIES: Record<MenuCategory, string> = { meals: "Meals", snacks: "Snacks", soft_drinks: "Soft drinks", alcoholic_drinks: "Alcoholic drinks", other: "Other" };
const METHODS: Record<PayMethod, string> = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS / card" };
const chip = (on: boolean) =>
  cn("inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-sm whitespace-nowrap", on ? "border-navy-800 bg-navy-800 text-white" : "border-hairline bg-ivory-50 text-ink-900 hover:bg-ink-900/7");
const toKobo = (naira: string) => Math.round(Number(naira.replace(/[^\d.]/g, "")) * 100);

type Step = "order" | "pay" | "done";

// The cart is keyed by item and note: "Chapman" and "Chapman · No ice" are separate lines (I8).
const SEP = "\u0001";
const keyOf = (id: string, note = "") => `${id}${SEP}${note}`;
const splitKey = (k: string) => {
  const i = k.indexOf(SEP);
  return i < 0 ? { id: k, note: "" } : { id: k.slice(0, i), note: k.slice(i + 1) };
};
const NOTE_CHIPS = ["No ice", "Cold", "Well done", "No pepper"];
const toggleChip = (note: string, chip: string) => {
  const parts = note.split(",").map((p) => p.trim()).filter(Boolean);
  const next = parts.includes(chip) ? parts.filter((p) => p !== chip) : [...parts, chip];
  return next.join(", ").slice(0, 60);
};

/** Quick table chips (configurable later). */
const CANCEL_REASONS = ["Customer left", "Wrong item", "Duplicate order"];
const TABLES = ["Bar counter", ...Array.from({ length: 12 }, (_, i) => `Table ${i + 1}`)];

const OFFLINE = `${OFFLINE_MESSAGE} If the internet stays down, use a numbered paper slip.`;
const saveSafe = safeAction(saveOpenOrder, OFFLINE);
const paySafe = safeAction(takePayment, OFFLINE);
const cancelSafe = safeAction(cancelOpenOrder, OFFLINE);

// ---- The order being taken, kept in this browser so a reload doesn't lose it ----
const draftKey = (staffId: string) => `victoria-till-draft:${staffId}`;
type Draft = { outlet: Outlet; cart: Record<string, number>; note: string; orderId: string; editing: { id: string; number: number } | null; at: number };
const draftListeners = new Set<() => void>();
function subscribeStorage(listener: () => void) {
  draftListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    draftListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readDraft(staffId: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(staffId));
  } catch {
    return null; // storage blocked
  }
}
function writeDraft(staffId: string, d: Omit<Draft, "at"> | null) {
  try {
    if (d) window.localStorage.setItem(draftKey(staffId), JSON.stringify({ ...d, at: Date.now() }));
    else window.localStorage.removeItem(draftKey(staffId));
  } catch {
    /* storage blocked: nothing to keep */
  }
  draftListeners.forEach((l) => l());
}
/** Only today's work (12 hours), and only items still on the menu. */
function parseDraft(raw: string | null, menu: MenuItem[]) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    if (Date.now() - d.at > 12 * 3_600_000) return null;
    const cart = Object.fromEntries(Object.entries(d.cart).filter(([k, q]) => q > 0 && menu.some((m) => m.id === splitKey(k).id)));
    const keys = Object.keys(cart);
    if (!keys.length) return null;
    const count = keys.reduce((n, k) => n + cart[k]!, 0);
    const totalKobo = keys.reduce((t, k) => t + cart[k]! * (menu.find((m) => m.id === splitKey(k).id)?.price_kobo ?? 0), 0);
    return { ...d, cart, count, totalKobo };
  } catch {
    return null;
  }
}

export function Till({ menu, open, attendant, vatRateBp, taxId = null, startOutlet = "bar", resume, favourites = { restaurant: [], bar: [] }, staffId = "", fullScreenRole = false, pay = { bank: { name: null, number: null, accountName: null }, terminals: [] }, bar }: {
  menu: MenuItem[]; open: OpenOrder[]; attendant: string; vatRateBp: number; taxId?: string | null; startOutlet?: Outlet; resume?: string;
  /** The hotel's bank details (shown for transfers) and POS terminals (section 2). */
  pay?: PaySettings;
  /** The dark till bar (design R2): business day, my sales, who's signed in. */
  bar?: { businessDay: string; sales: number; salesKobo: number; onStation: boolean; sessionStartedAt?: string };
  /** Restaurant & bar staff get the full-screen till on any computer; others on a station set to a counter (I8). */
  fullScreenRole?: boolean;
  /** Each counter's best sellers, shown as a quick row above the menu. */
  favourites?: Record<Outlet, string[]>;
  /** Drafts are kept per staff member: the next person to sign in doesn't see someone else's order. */
  staffId?: string;
}) {
  const resumeOrder = open.find((o) => o.id === resume);
  // Which counter: the order being resumed, else what the salesperson picked, else this station's default (H5).
  const station = useStation();
  const online = useOnline();
  const stationConfigured = useStationConfigured();
  const [outletChoice, setOutlet] = useState<Outlet | null>(resumeOrder?.outlet ?? null);
  const outlet: Outlet = outletChoice ?? station.counter ?? startOutlet;
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>(() => Object.fromEntries((resumeOrder?.lines ?? []).map((l) => [keyOf(l.menuItemId, l.note ?? ""), l.quantity])));
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [skipped, setSkipped] = useState<string | null>(null);
  const [note, setNote] = useState(resumeOrder?.note ?? "");
  const [editing, setEditing] = useState<{ id: string; number: number } | null>(resumeOrder ? { id: resumeOrder.id, number: resumeOrder.number } : null);
  const [step, setStep] = useState<Step>("order");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [transferRef, setTransferRef] = useState("");
  const [transferChecked, setTransferChecked] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [slip, setSlip] = useState("");
  const [terminal, setTerminal] = useState("");
  const [debit, setDebit] = useState<null | "ask" | "done">(null);
  const [debitError, setDebitError] = useState<string | null>(null);
  const dupOk = useRef<HTMLInputElement>(null);
  const defaultTerminal = pay.terminals.find((t) => t.toLowerCase().includes(outlet === "bar" ? "bar" : "restaurant")) ?? pay.terminals[0] ?? "";
  const [typeName, setTypeName] = useState(false);
  const [calc, setCalc] = useState(false);
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
  const finding = find.trim().toLowerCase();
  // On "All", each counter's best sellers come first (the quick row of earlier tills, folded into the grid per R2).
  const rank = (id: string) => {
    const i = (favourites[outlet] ?? []).indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const shown = finding
    ? items.filter((m) => m.name.toLowerCase().includes(finding))
    : items.filter((m) => category === "all" || m.category === category).sort((a, b) => (category === "all" ? rank(a.id) - rank(b.id) : 0));
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([key, q]) => {
          const { id, note } = splitKey(key);
          return { key, item: menu.find((m) => m.id === id)!, note, q };
        })
        .filter((l) => l.item && l.q > 0),
    [cart, menu],
  );
  /** How many of an item are in the order, across its lines (one stock limit for all of them). */
  const itemQty = (c: Record<string, number>, id: string) => Object.entries(c).reduce((n, [k, q]) => (splitKey(k).id === id ? n + q : n), 0);
  const total = lines.reduce((s, l) => s + l.item.price_kobo * l.q, 0);
  const count = lines.reduce((s, l) => s + l.q, 0);
  const givenKobo = given ? toKobo(given) : null;
  const change = givenKobo != null ? givenKobo - total : null;
  const maxFor = (m: MenuItem) => Math.min(99, m.stock_left ?? 99);

  const reset = () => {
    orderId.current = "";
    setCart({});
    setNote("");
    setNoteFor(null);
    setSkipped(null);
    setEditing(null);
    setGiven("");
    setMethod("cash");
    setTransferRef("");
    setTransferChecked(false);
    setTypeName(false);
    setStep("order");
  };
  const add = (m: MenuItem, d: number) => {
    // After a payment the receipt panel stays up; tapping the menu starts the next order.
    if (step === "done") {
      setReceipt(null);
      reset();
      setCart({ [keyOf(m.id)]: Math.max(0, Math.min(maxFor(m), d)) });
      return;
    }
    changeLine(keyOf(m.id), m, d);
  };
  /** Change one line by d, within the item's stock across all its lines. */
  const changeLine = (key: string, m: MenuItem, d: number) =>
    setCart((c) => {
      const cur = c[key] ?? 0;
      const room = maxFor(m) - (itemQty(c, m.id) - cur);
      return { ...c, [key]: Math.max(0, Math.min(room, cur + d)) };
    });
  /** Move a line to a new note (merging with a line that already has it). */
  const setLineNote = (key: string, note: string) => {
    const { id } = splitKey(key);
    const next = keyOf(id, note.slice(0, 60));
    if (next === key) return;
    setCart((c) => {
      const { [key]: q = 0, ...rest } = c;
      return { ...rest, [next]: (rest[next] ?? 0) + q };
    });
    setNoteFor(next);
  };
  const editingOrder = editing ? open.find((o) => o.id === editing.id) : undefined;
  /** "Same again": the lines added at the order's last save, again, at today's menu prices. */
  const sameAgain = () => {
    if (!editingOrder) return;
    const missed: string[] = [];
    setCart((c) => {
      const next = { ...c };
      for (const l of editingOrder.lastRound) {
        const m = menu.find((x) => x.id === l.menuItemId && x.is_active && x.is_available && x.stock_left !== 0);
        if (!m) {
          missed.push(menu.find((x) => x.id === l.menuItemId)?.name ?? "An item");
          continue;
        }
        const k = keyOf(m.id, l.note ?? "");
        const room = maxFor(m) - itemQty(next, m.id);
        if (room < l.quantity) missed.push(m.name);
        next[k] = (next[k] ?? 0) + Math.max(0, Math.min(room, l.quantity));
      }
      return next;
    });
    setSkipped(missed.length ? `Not added (unavailable or not enough stock): ${[...new Set(missed)].join(", ")}.` : null);
  };
  const linesJson = JSON.stringify(lines.map((l) => ({ menuItemId: l.item.id, quantity: l.q, note: l.note || null })));

  /** POS declined but the customer was debited: the order is kept unpaid and flagged for the manager (section 2). */
  const flagDebit = async () => {
    setDebitError(null);
    if (!orderId.current) orderId.current = crypto.randomUUID();
    const r = await reportTillDebit({ id: orderId.current, outlet, lines: linesJson, note, terminal: terminal || defaultTerminal, slipLast4: slip });
    if (!r.ok) return setDebitError(r.message);
    setEditing({ id: orderId.current, number: r.data.number });
    setDebit("done");
  };

  // A refresh, a UPS changeover or a power cut mustn't lose the order being taken: a copy of the
  // current order is kept in this browser, and after a reload the till offers to bring it back.
  const draftRaw = useSyncExternalStore(subscribeStorage, () => readDraft(staffId), () => null);
  const draft = useMemo(() => parseDraft(draftRaw, menu), [draftRaw, menu]);
  const hadLines = useRef(false);
  useEffect(() => {
    if (lines.length && step !== "done") {
      hadLines.current = true;
      writeDraft(staffId, { outlet, cart, note, orderId: orderId.current, editing });
    } else if (hadLines.current) {
      // The order was paid, saved or cleared. (An empty till after a reload keeps the saved copy for the offer to restore.)
      hadLines.current = false;
      writeDraft(staffId, null);
    }
  }, [outlet, cart, note, editing, lines.length, step, staffId]);
  const restoreDraft = () => {
    if (!draft) return;
    setReceipt(null);
    setStep("order");
    setOutlet(draft.outlet);
    setCart(draft.cart);
    setNote(draft.note);
    setEditing(draft.editing && open.some((o) => o.id === draft.editing!.id) ? draft.editing : null);
    orderId.current = draft.orderId;
  };

  // Full-screen till on the bar station or for restaurant & bar staff; dark colours if the station says so (I8).
  const fullScreen = fullScreenRole || station.counter != null;
  const dark = fullScreen && station.tillDark;
  useEffect(() => {
    const html = document.documentElement;
    if (fullScreen) html.dataset.tillFull = "";
    if (dark) html.dataset.tillDark = "";
    return () => {
      delete html.dataset.tillFull;
      delete html.dataset.tillDark;
    };
  }, [fullScreen, dark]);

  // Auto-print (station setting): once per receipt, after the print copy is on the page.
  const printed = useRef(new Set<string>());
  useEffect(() => {
    const n = receipt?.receiptNumber;
    if (!shouldAutoPrint(station, n, printed.current)) return;
    printed.current.add(n!);
    window.print();
  }, [receipt?.receiptNumber, station]);

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
    setCart(Object.fromEntries(o.lines.map((l) => [keyOf(l.menuItemId, l.note ?? ""), l.quantity])));
    setNoteFor(null);
    setSkipped(null);
    setNote(o.note ?? "");
    setEditing({ id: o.id, number: o.number });
    orderId.current = o.id;
    setStep("order");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    // Laptops: the till fills the window. The menu (and unpaid orders under it) scrolls in its own
    // column and the order panel stays pinned, so the page itself never scrolls (UX brief: 1280×720).
    <div className="space-y-8 pb-24 lg:flex lg:h-full lg:flex-col lg:space-y-0 lg:pb-0">
      {receipt ? <div className="hidden print:block"><PosReceipt r={receipt} printable={!stationConfigured || station.printLayout !== "a4"} /></div> : null}
      {/* The bar terminal (1280×720, kiosk) and wider: unpaid · menu · order. Smaller screens: menu · order, unpaid orders under the menu. */}
      {bar ? (
        <TillBar
          bar={bar}
          attendant={attendant}
          outlet={outlet}
          locked={!!editing}
          onOutlet={(o) => { if (o !== outlet) { setOutlet(o); setCategory("all"); setCart({}); } }}
        />
      ) : null}
      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_24rem] print:hidden">
        <section aria-label="Menu" className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2 lg:pb-4">
          {step === "pay" ? (
            // Taking payment: the details get the wide column (room for the keypad); Confirm stays with the order.
            <div className="mx-auto w-full max-w-md space-y-4">
              <div>
                <p className="text-[13px] font-semibold tracking-wide text-ink-500 uppercase">Take payment{note ? ` · ${note}` : ""}</p>
                <p className="text-4xl font-bold tabular-nums text-ink-900">{formatNaira(total)}</p>
                <button type="button" onClick={() => setStep("order")} className="mt-1 text-sm font-semibold text-navy-700 hover:underline">← Back to order</button>
              </div>
          <form
            id="till-pay"
            action={payAction}
            onSubmit={(e) => {
              stampId(e);
              snapshot.current = {
                outlet, receiptNumber: "", orderNumber: 0, paidAt: "", attendant, vatRateBp, taxId,
                lines: lines.map((l) => ({ name: l.item.name, quantity: l.q, unitKobo: l.item.price_kobo, note: l.note || null })),
                totalKobo: total, method, cashReceivedKobo: method === "cash" ? givenKobo : null,
                reference: method === "pos_terminal" ? slip : method === "bank_transfer" ? transferRef.trim() || senderName.trim() || null : null,
              };
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" defaultValue="" />
            <input type="hidden" name="outlet" value={outlet} />
            <input type="hidden" name="lines" value={linesJson} />
            <input type="hidden" name="note" value={note} />
            <input type="hidden" name="method" value={method} />
            <input ref={dupOk} type="hidden" name="duplicateOk" defaultValue="" />
            <Segmented
              label="How is the customer paying?"
              size="lg"
              className="w-full"
              value={method}
              onChange={(k) => { setMethod(k); setTransferRef(""); setSlip(""); setDebit(null); }}
              options={(Object.keys(METHODS) as PayMethod[]).map((k) => ({ value: k, label: METHODS[k] }))}
            />
            {method === "cash" ? (
              <div className="space-y-2 rounded-md bg-white p-3">
                <label className="block">
                  <span className="mb-1 block text-[13px] text-ink-700">Customer gave (₦)</span>
                  <Input name="cashReceived" inputMode="none" value={given} onChange={(e) => setGiven(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(total / 100)} className="text-lg tabular-nums" />
                </label>
                <NumPad onChange={setGiven} decimal maxLength={10} label="cash the customer gave" />
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
            {method === "bank_transfer" ? (
              <div className="space-y-3 rounded-lg bg-white p-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-900">Transfer reference</span>
                  <Input name="paymentReference" value={transferRef} onChange={(e) => setTransferRef(e.target.value)} inputMode={typeName ? "text" : "none"} maxLength={80} autoComplete="off" className="w-56 text-lg tabular-nums" />
                  <span className="mt-1 block text-sm text-ink-500">Or the sender&apos;s name if there is no reference</span>
                </label>
                {typeName ? null : <NumPad onChange={setTransferRef} maxLength={12} label="the transfer reference" />}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-900">Sender&apos;s name</span>
                  <Input name="senderName" value={senderName} onFocus={() => setTypeName(true)} onChange={(e) => setSenderName(e.target.value)} maxLength={80} autoComplete="off" className="w-64" />
                </label>
                <label className="flex gap-3 rounded-lg border border-hairline p-3 text-sm text-ink-800">
                  <input type="checkbox" name="transferChecked" checked={transferChecked} onChange={(e) => setTransferChecked(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy-900" />
                  <span className="font-semibold text-ink-900">I&apos;ve seen {formatNaira(total)} land in the hotel&apos;s bank app</span>
                </label>
                <p className="text-sm text-[#8a4b06]">Never on the customer&apos;s phone. Fake alerts look real. Check the hotel&apos;s bank app, or ask the manager.</p>
                <BankLine bank={pay.bank} />
                <p className="text-xs text-ink-500">Your name goes on this sale. The manager confirms it against the bank tomorrow.</p>
              </div>
            ) : null}
            {method === "pos_terminal" ? (
              <div className="space-y-3 rounded-lg bg-white p-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-900">Slip: last 4 digits</span>
                  <Input
                    name="slipLast4"
                    value={slip}
                    onChange={(e) => setSlip(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="none"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="off"
                    className="w-32 text-lg tracking-[0.3em] tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-900">Terminal</span>
                  <Select name="terminal" value={terminal || defaultTerminal} onChange={(e) => setTerminal(e.target.value)} className="w-60">
                    {pay.terminals.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </label>
                <p className="text-sm text-ink-600">Only after the terminal prints <strong>APPROVED</strong>.</p>
                <NumPad onChange={setSlip} maxLength={4} label="the POS slip" />
                {debit === "done" ? (
                  <FormMessage tone="success">Flagged for the manager to check with the bank. Nothing was recorded; the order stays unpaid.</FormMessage>
                ) : debit === "ask" ? (
                  <div className="space-y-2 rounded-lg border border-[#f1b8b8] p-3">
                    <p className="text-sm text-ink-900">Declined but the customer was debited {formatNaira(total)}? Nothing is recorded as paid; the order is kept unpaid and the manager checks with the bank.</p>
                    {debitError ? <FormMessage>{debitError}</FormMessage> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="danger" onClick={() => void flagDebit()}>Flag it</Button>
                      <Button variant="ghost" onClick={() => setDebit(null)}>Back</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" className="px-0" onClick={() => setDebit("ask")}>Declined but customer was debited</Button>
                )}
              </div>
            ) : null}
            {payState && !payState.ok && payState.fieldErrors?.duplicate ? (
              <div role="alert" className="space-y-2 rounded-lg border border-[#f3d28a] bg-[#fff4dc] p-3 text-sm text-[#8a4b06]">
                <p>{payState.fieldErrors.duplicate[0]}</p>
                <Button variant="secondary" onClick={() => { if (dupOk.current) dupOk.current.value = "1"; (document.getElementById("till-pay") as HTMLFormElement | null)?.requestSubmit(); }}>Record anyway</Button>
              </div>
            ) : null}
          </form>
            </div>
          ) : (
          <>
          {bar ? null : (
            <Segmented
              label="Counter"
              value={outlet}
              onChange={(o) => { if (o !== outlet && !editing) { setOutlet(o); setCategory("all"); setCart({}); } }}
              options={(Object.keys(OUTLETS) as Outlet[]).map((o) => ({ value: o, label: OUTLETS[o], disabled: !!editing && o !== outlet }))}
            />
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] font-semibold whitespace-nowrap text-ink-500 uppercase">Open orders · {open.length}</span>
            {open.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={editing?.id === o.id}
                onClick={() => { setReceipt(null); resumeOpen(o); }}
                className={cn(
                  "inline-flex h-9 w-fit items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap pointer-coarse:h-11",
                  editing?.id === o.id ? "border-navy-900 bg-[#e8eefb]" : /^(T\d+|Table \d+|Bar)$/.test(o.note ?? "") ? "border-hairline bg-white" : "border-[#f0c46a] bg-[#fff8e6]",
                )}
              >
                <b className="font-semibold text-ink-900">{o.note || `#${o.number}`}</b>
                <span className="tabular-nums text-ink-500">{formatNaira(o.total_kobo)}</span>
              </button>
            ))}
            {editing ? <Button size="sm" variant="ghost" onClick={() => { setReceipt(null); reset(); }}><Plus className="size-4" aria-hidden /> New order</Button> : null}
          </div>
          <div className="relative flex items-center gap-4">
            <label className="relative block flex-1">
              <span className="sr-only">Find an item</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              {/* type=search: the touch keyboard opens on the bar terminal. */}
              <Input type="search" inputMode="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an item…" data-till-search="" className="h-11 pl-10" />
            </label>
            <Button variant="secondary" aria-expanded={calc} onClick={() => setCalc(!calc)}>Calculator</Button>
            {calc ? <Calculator onClose={() => setCalc(false)} /> : null}
          </div>
          {categories.length > 1 && !finding ? (
            <Tabs
              label="Category"
              value={category}
              onChange={setCategory}
              options={[{ value: "all" as const, label: "All" }, ...categories.map((c) => ({ value: c, label: CATEGORIES[c] }))]}
            />
          ) : null}
          {shown.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((m) => {
                const out = m.stock_left === 0;
                const off = !m.is_available || out;
                const inCart = itemQty(cart, m.id);
                const full = inCart >= maxFor(m);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={off || full}
                      onClick={() => add(m, 1)}
                      className={cn(
                        "relative flex min-h-24 w-full flex-col items-start justify-between rounded-[10px] border px-3.5 py-3 text-left transition-colors",
                        inCart ? "border-2 border-navy-900 bg-[#e8eefb]" : "border-hairline bg-white hover:border-ink-400",
                        off && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="text-base leading-tight font-semibold text-ink-900">{m.name}</span>
                      <span className="mt-2 flex w-full items-end justify-between gap-2">
                        <span className="text-[17px] font-bold tabular-nums text-ink-900">{formatNaira(m.price_kobo)}</span>
                        {inCart ? <span className="rounded-full bg-navy-800 px-2 text-sm font-semibold tabular-nums text-white">{inCart}</span> : null}
                      </span>
                      {!m.is_available ? (
                        <span className="mt-1 text-xs font-medium text-ink-600">Unavailable today</span>
                      ) : out ? (
                        <span className="mt-1 text-xs font-medium text-danger-700">Out of stock</span>
                      ) : m.stock_left == null ? (
                        <span className="mt-1 text-xs text-ink-500">Made to order</span>
                      ) : m.low ? (
                        <span className="mt-1 text-xs font-medium text-warning-700">{m.stock_left} left</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-hairline p-6 text-sm text-ink-500">
              {finding ? `Nothing on the ${OUTLETS[outlet].toLowerCase()} menu matches “${find.trim()}”.` : `No ${OUTLETS[outlet].toLowerCase()} items on the menu yet. A manager adds them under Menu.`}
            </p>
          )}
          </>
          )}
        </section>

        <section id="order" aria-label="This order" className="h-fit space-y-4 rounded-xl border border-hairline bg-white p-5 lg:max-h-full lg:overflow-y-auto">
          {step === "done" && receipt ? (
            // Slim receipt: the essentials, Print and New order. The full receipt is only for printing.
            <div className="space-y-4" role="status">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success-700" aria-hidden />
                <div>
                  <p className="font-semibold text-ink-900">{alreadyPaid ? "Already paid" : "Paid"} · {formatNaira(receipt.totalKobo)}</p>
                  <p className="text-sm text-ink-600">
                    {METHODS[receipt.method]}
                    {receipt.reference ? (receipt.method === "pos_terminal" ? ` · slip …${receipt.reference}` : ` · ref ${receipt.reference}`) : ""} · {receipt.receiptNumber}
                  </p>
                </div>
              </div>
              {receipt.method === "cash" && receipt.cashReceivedKobo != null ? (
                <p className="rounded-md bg-success-50 px-3 py-2 text-lg font-semibold tabular-nums text-success-700">Give change: {formatNaira(receipt.cashReceivedKobo - receipt.totalKobo)}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" aria-hidden /> Print</Button>
                <Button autoFocus onClick={() => { setReceipt(null); reset(); }}>New order</Button>
              </div>
              <p className="text-xs text-ink-500">Or tap an item on the menu to start the next order.</p>
            </div>
          ) : (
          <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl text-navy-950">{editing ? `Order #${editing.number}` : "New order"}</h2>
            {lines.length ? <button type="button" onClick={reset} className="text-sm text-ink-500 underline-offset-2 hover:underline">Clear</button> : null}
          </div>
          {draft && !lines.length && step === "order" ? (
            <div className="rounded-md border border-gold-300 bg-gold-50 p-3 text-sm" role="status">
              <p className="text-ink-900">
                Unfinished order from before the page reloaded: {draft.count} item{draft.count === 1 ? "" : "s"} · {formatNaira(draft.totalKobo)}
                {draft.note ? ` · ${draft.note}` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={restoreDraft}>Bring it back</Button>
                <Button size="sm" variant="ghost" onClick={() => writeDraft(staffId, null)}>Discard</Button>
              </div>
            </div>
          ) : null}
          {saveState && !saveState.ok ? <FormMessage>{saveState.message}</FormMessage> : null}
          {payState && !payState.ok ? <FormMessage>{payState.message}</FormMessage> : null}
          {saveState?.ok && !lines.length ? <FormMessage tone="success">Order #{saveState.data.number} saved as unpaid.</FormMessage> : null}

          {editingOrder?.lastRound.length && step === "order" ? (
            <Button variant="secondary" size="sm" onClick={sameAgain} className="w-full" data-same-again="">
              <Repeat2 className="size-4" aria-hidden /> Same again ({editingOrder.lastRound.map((l) => `${l.quantity} × ${menu.find((m) => m.id === l.menuItemId)?.name ?? "item"}`).join(", ")})
            </Button>
          ) : null}
          {skipped ? <FormMessage>{skipped}</FormMessage> : null}
          {lines.length ? (
            <ul className="divide-y divide-hairline">
              {lines.map((l) => (
                <li key={l.key} className="py-2" data-line={l.item.name}>
                  <div className="flex items-start justify-between gap-2">
                    {/* Tap the name for a note ("No ice"), printed under the item on the receipt. */}
                    <button type="button" onClick={() => setNoteFor(noteFor === l.key ? null : l.key)} aria-expanded={noteFor === l.key} className="min-w-0 text-left text-[15px] text-ink-900">
                      {l.item.name}
                      {l.note ? <span className="block text-xs text-gold-700 italic">{l.note}</span> : null}
                    </button>
                    <span className="shrink-0 text-[15px] tabular-nums text-ink-900">{formatNaira(l.item.price_kobo * l.q)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <button type="button" onClick={() => setNoteFor(noteFor === l.key ? null : l.key)} className="mr-auto inline-flex min-h-10 items-center gap-1 text-xs text-ink-500 hover:text-ink-900">
                      <MessageSquare className="size-3.5" aria-hidden /> {l.note ? "Note" : "Add note"} · {formatNaira(l.item.price_kobo)} each
                    </button>
                    <button type="button" aria-label={`Remove ${l.item.name}`} onClick={() => changeLine(l.key, l.item, -l.q)} className="flex size-10 items-center justify-center rounded pointer-coarse:size-12 text-ink-500 hover:bg-ink-900/5"><Trash2 className="size-4" /></button>
                    <button type="button" aria-label={`One less ${l.item.name}`} onClick={() => changeLine(l.key, l.item, -1)} className="flex size-10 items-center justify-center rounded pointer-coarse:size-12 border border-hairline text-navy-700"><Minus className="size-4" /></button>
                    <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">{l.q}</span>
                    <button type="button" aria-label={`One more ${l.item.name}`} disabled={itemQty(cart, l.item.id) >= maxFor(l.item)} onClick={() => changeLine(l.key, l.item, 1)} className="flex size-10 items-center justify-center rounded pointer-coarse:size-12 border border-hairline text-navy-700 disabled:opacity-40"><Plus className="size-4" /></button>
                  </div>
                  {noteFor === l.key ? (
                    <div className="mt-2 space-y-2 rounded-md bg-ivory-100 p-2" data-note-editor="">
                      <div className="flex flex-wrap gap-1.5">
                        {NOTE_CHIPS.map((c) => {
                          const on = l.note.split(",").map((p) => p.trim()).includes(c);
                          return <button key={c} type="button" aria-pressed={on} onClick={() => setLineNote(l.key, toggleChip(l.note, c))} className={cn(chip(on), "min-h-10 px-3 text-xs pointer-coarse:min-h-11")}>{c}</button>;
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={l.note}
                          onChange={(e) => setLineNote(l.key, e.target.value.replace(/\s+/g, " ").trimStart())}
                          placeholder="Or type a note"
                          aria-label={`Note for ${l.item.name}`}
                          maxLength={60}
                          className="h-10 min-w-0 flex-1 text-sm"
                        />
                        <Button size="sm" variant="secondary" onClick={() => setNoteFor(null)}>Done</Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">Tap items on the menu to add them.</p>
          )}

          <div className="flex items-baseline justify-between border-t border-hairline pt-3">
            <span className="text-ink-700">Total{count ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}</span>
            <span className="text-3xl font-bold tabular-nums text-ink-900">{formatNaira(total)}</span>
          </div>

          {step === "order" ? (
            <>
              <TableOrName value={note} onChange={setNote} open={open} outlet={outlet} />
              {/* Pinned to the bottom of the order panel, so Pay is always on screen however long the order is. */}
              <div className="sticky bottom-0 -mx-5 -mb-5 grid gap-2 border-t border-hairline bg-white px-5 pt-3 pb-5">
                {/* The one primary button on the till (R1): full width, 60px, at the foot of the order panel. */}
                <Button size="lg" disabled={!lines.length || !online} title={online ? undefined : OFFLINE_REASON} onClick={() => setStep("pay")} className="w-full" data-pay="">
                  Take payment · <span className="tabular-nums">{formatNaira(total)}</span>
                </Button>
                <form action={saveAction} onSubmit={stampId}>
                  <input type="hidden" name="id" defaultValue="" />
                  <input type="hidden" name="outlet" value={outlet} />
                  <input type="hidden" name="lines" value={linesJson} />
                  <input type="hidden" name="note" value={note} />
                  <Button type="submit" variant="secondary" className="w-full" pending={saving} disabled={!lines.length}>
                    {editing ? "Keep order open (save changes)" : "Keep order open"}
                  </Button>
                </form>
                {editing ? <CancelOrderControl id={editing.id} /> : null}
              </div>
            </>
          ) : (
              <div className="flex flex-col items-center gap-2">
                {/* Confirm stays with the order; the payment details are in the wide column (form="till-pay"). */}<Button type="submit" form="till-pay" size="lg" className="h-16 w-full min-w-0 text-lg" pending={paying} title={online ? undefined : OFFLINE_REASON} disabled={!online || !lines.length || (method === "cash" && change != null && change < 0) || (method === "bank_transfer" && ((transferRef.trim().length < 3 && senderName.trim().length < 2) || !transferChecked)) || (method === "pos_terminal" && (!/^\d{4}$/.test(slip) || !(terminal || defaultTerminal) || debit === "done"))}>
                  Confirm {formatNaira(total)} paid
                </Button>
                <p className="text-center text-xs text-ink-500">{method === "cash" ? "Prints the receipt and opens the cash drawer" : "Prints the receipt"}</p>
              </div>
          )}
          </>
          )}
        </section>
      </div>


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

/** Cancel the open order being edited (a reason is required; the manager sees it). */
function CancelOrderControl({ id }: { id: string }) {
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState(false);
  const [state, action, pending] = useActionState(cancelSafe, null);
  if (!confirm) return <Button variant="ghost" className="mx-auto text-danger-700" onClick={() => setConfirm(true)}>Cancel this order</Button>;
  return (
    <form action={action} className="space-y-2 rounded-lg border border-[#f1b8b8] p-3">
      <input type="hidden" name="id" value={id} />
      {/* Preset reasons for the touch screen; "Other" types one. The manager sees the reason. */}
      <input type="hidden" name="reason" value={reason} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Why is this order cancelled?">
        {CANCEL_REASONS.map((r) => (
          <button key={r} type="button" aria-pressed={!other && reason === r} onClick={() => { setOther(false); setReason(r); }} className={cn(chip(!other && reason === r), "min-h-10 px-3 text-xs pointer-coarse:min-h-11")}>{r}</button>
        ))}
        <button type="button" aria-pressed={other} onClick={() => { setOther(true); setReason(""); }} className={cn(chip(other), "min-h-10 px-3 text-xs pointer-coarse:min-h-11")}>Other</button>
      </div>
      {other ? <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened? (the manager sees this)" aria-label="Other reason" className="h-10 text-sm" /> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" pending={pending} disabled={reason.trim().length < 3}>Cancel order</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
      </div>
      {state && !state.ok ? <p className="text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

/** The dark till bar (design R2): counter, business day, my sales, Orders, Close my day, who's signed in, Lock. */
function TillBar({ bar, attendant, outlet, locked, onOutlet }: { bar: NonNullable<Parameters<typeof Till>[0]["bar"]>; attendant: string; outlet: Outlet; locked: boolean; onOutlet: (o: Outlet) => void }) {
  const first = attendant.split(" ")[0] ?? attendant;
  const initials = attendant.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const link = "inline-flex h-9 items-center rounded-lg border border-white/35 px-3 text-sm whitespace-nowrap text-white hover:bg-white/10 pointer-coarse:h-11";
  return (
    <header className="-mx-4 -mt-6 mb-4 flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 bg-[#0b1f5c] px-5 py-2 lg:-mx-8 print:hidden">
      <span className="font-brand text-[22px] text-white">Victoria</span>
      <div role="group" aria-label="Counter" className="flex rounded-lg bg-white/10 p-[3px]">
        {(Object.keys(OUTLETS) as Outlet[]).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === outlet}
            disabled={locked && o !== outlet}
            onClick={() => onOutlet(o)}
            className={cn("h-9 rounded-md px-4 text-[15px] font-semibold disabled:opacity-40 pointer-coarse:h-11", o === outlet ? "bg-white text-[#0b1f5c]" : "text-[#cfd6f0]")}
          >
            {OUTLETS[o]}
          </button>
        ))}
      </div>
      <span className="text-sm text-[#cfd6f0]">{bar.businessDay}</span>
      <span className="flex-1" />
      <span className="text-sm text-[#cfd6f0]">My sales <b className="text-white tabular-nums">{bar.sales} · {formatNaira(bar.salesKobo)}</b></span>
      <Link href="/app/sales/orders" className={link}>Orders</Link>
      <Link href="/app/sales/closing" className={link}>Close my day</Link>
      <span className="border-l border-white/20 pl-3">
        <Popover
          label={`${attendant}'s till menu`}
          role="menu"
          triggerClassName="flex h-9 items-center gap-2 rounded-lg px-1 text-white hover:bg-white/10 pointer-coarse:h-11"
          trigger={<><span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-gold-400 text-[13px] font-bold text-[#0b1f5c]">{initials}</span><span className="text-sm">{first}</span><span aria-hidden className="text-xs">▾</span></>}
          panelClassName="w-64 p-1"
        >
          {(close) => (
            <>
              <div className="border-b border-hairline px-3 py-2.5">
                <p className="font-semibold text-ink-900">{attendant}</p>
                <p className="text-xs text-ink-500">{OUTLETS[outlet]}{bar.sessionStartedAt ? ` · since ${new Date(bar.sessionStartedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}` : ""}</p>
              </div>
              {bar.onStation ? (
                <button type="button" role="menuitem" onClick={() => { close(); requestLock(); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-ivory-100">
                  <span className="block text-[15px] font-medium text-ink-900">Lock</span>
                  <span className="block text-xs text-ink-500">Back to the names screen</span>
                </button>
              ) : null}
              <Link role="menuitem" href="/app/sales/closing" onClick={close} className="block rounded-md px-3 py-2 text-[15px] text-ink-900 hover:bg-ivory-100">Close my day</Link>
              <Link role="menuitem" href="/app/sales/orders" onClick={close} className="block rounded-md px-3 py-2 text-[15px] text-ink-900 hover:bg-ivory-100">Orders &amp; receipts</Link>
              {bar.onStation ? (
                <button type="button" role="menuitem" onClick={() => { close(); requestLock(); }} className="block w-full rounded-md px-3 py-2 text-left text-[15px] text-ink-900 hover:bg-ivory-100">Switch user</button>
              ) : null}
            </>
          )}
        </Popover>
      </span>
      {bar.onStation ? (
        <button type="button" onClick={requestLock} className="h-9 rounded-lg bg-gold-400 px-3.5 text-sm font-bold text-[#0b1f5c] pointer-coarse:h-11">Lock</button>
      ) : null}
    </header>
  );
}

/**
 * Table or name (designs R2, D3): a dropdown of the tables, each showing whether it has an open order and for how
 * much, and "Type a name…" for a customer's name.
 */
function TableOrName({ value, onChange, open, outlet }: { value: string; onChange: (v: string) => void; open: OpenOrder[]; outlet: Outlet }) {
  const [name, setName] = useState(TABLES.includes(value) ? "" : value);
  const openFor = (t: string) => open.filter((o) => o.outlet === outlet && (o.note ?? "") === t);
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-500 uppercase">Table or name</span>
      <Popover
        label="Table or name"
        align="stretch"
        role="menu"
        triggerClassName="flex h-11 w-full items-center justify-between rounded-lg border border-[#bdb7a8] bg-white px-3 text-[15px] text-ink-900"
        trigger={<><span className={value ? "" : "text-ink-500"}>{value || "No table"}</span><span aria-hidden>▾</span></>}
        panelClassName="top-auto bottom-[calc(100%+6px)] max-h-60 overflow-y-auto p-1"
      >
        {(close) => (
          <>
            <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 flex gap-2 border-b border-hairline bg-white p-2">
              <Input
                aria-label="Customer's name"
                placeholder="Type a name… e.g. Kunle"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 120))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) {
                    e.preventDefault();
                    onChange(name.trim());
                    close();
                  }
                }}
                className="h-10 min-w-0 flex-1"
              />
              <Button size="sm" variant="secondary" disabled={!name.trim()} onClick={() => { onChange(name.trim()); close(); }}>Use</Button>
            </div>
            {TABLES.map((t) => {
              const busy = openFor(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === t}
                  onClick={() => { onChange(t); close(); }}
                  className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-[15px] hover:bg-ivory-100", value === t && "bg-[#e8eefb] font-semibold")}
                >
                  <span>{t}</span>
                  {busy.length ? <span className="text-xs font-semibold text-[#8a4b06]">Open · {formatNaira(busy.reduce((n, o) => n + o.total_kobo, 0))}</span> : null}
                </button>
              );
            })}

            {value ? (
              <button type="button" onClick={() => { onChange(""); setName(""); close(); }} className="w-full px-3 py-2 text-left text-sm text-navy-700 hover:underline">No table</button>
            ) : null}
          </>
        )}
      </Popover>
    </div>
  );
}

/** The till calculator (design X8): plus, minus, times, divide, clear. It saves nothing and sends nothing. */
function Calculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const evaluate = (e: string): number | null => {
    // Only digits and + − × ÷, evaluated left to right with × and ÷ first. No eval().
    const tokens = e.replace(/,/g, "").match(/\d+(?:\.\d+)?|[+\-×÷]/g);
    if (!tokens || !/^\d/.test(tokens[0]!)) return null;
    const nums: number[] = [Number(tokens[0])];
    const ops: string[] = [];
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i]!;
      const n = Number(tokens[i + 1]);
      if (!Number.isFinite(n)) return null;
      if (op === "×") nums[nums.length - 1]! *= n;
      else if (op === "÷") {
        if (n === 0) return null;
        nums[nums.length - 1]! /= n;
      } else {
        ops.push(op);
        nums.push(n);
      }
    }
    return nums.reduce((t, n, i) => (i === 0 ? n : ops[i - 1] === "+" ? t + n : t - n));
  };
  const press = (k: string) => {
    if (k === "C") {
      setExpr("");
      setResult(null);
    } else if (k === "=") {
      const r = evaluate(expr);
      setResult(r == null ? "Can't work that out" : r.toLocaleString("en-NG", { maximumFractionDigits: 2 }));
    } else {
      setResult(null);
      setExpr((e) => (/[+\-×÷]$/.test(e) && /[+\-×÷]/.test(k) ? e.slice(0, -1) + k : e + k));
    }
  };
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "C", "0", "=", "+"];
  return (
    <div role="dialog" aria-label="Calculator" className="absolute top-full right-0 z-40 mt-2 w-72 rounded-xl border border-hairline bg-white p-4 shadow-lg">
      <div className="flex items-baseline justify-between">
        <p className="font-bold text-ink-900">Calculator</p>
        <p className="text-xs text-ink-500">Doesn&apos;t record anything</p>
      </div>
      <p className="mt-3 min-h-5 text-right text-sm text-ink-500 tabular-nums">{expr.replace(/−/g, "−") || " "}</p>
      <p className="text-right text-3xl font-bold text-ink-900 tabular-nums" aria-live="polite">{result ?? (evaluate(expr)?.toLocaleString("en-NG", { maximumFractionDigits: 2 }) ?? "0")}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k === "−" ? "-" : k)}
            className={cn("h-12 rounded-lg border text-lg font-semibold", k === "=" ? "border-navy-900 bg-navy-900 text-white" : /[÷×−+]/.test(k) ? "border-hairline bg-[#e8eefb] text-navy-900" : "border-hairline bg-white text-ink-900")}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="mt-3 text-center"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
    </div>
  );
}

