"use client";

import { Check } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Textarea } from "@/components/ui/form";
import { NumPad } from "@/components/ui/num-pad";
import { formatNaira } from "@/lib/format";
import { safeAction } from "@/lib/safe-action";
import { cn } from "@/lib/utils/cn";
import { closeMyDay, signOffClosing } from "@/server/pos";

function Steps({ current, openOrders }: { current: 2 | 3 | 4; openOrders: number }) {
  const step = (n: number, label: ReactNode, state: "done" | "now" | "later" | "blocked") => (
    <li key={n} className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
          state === "done" && "bg-[#e7f6ec] text-[#166534]",
          state === "now" && "bg-navy-900 text-white",
          state === "later" && "bg-[#eae7df] text-ink-600",
          state === "blocked" && "bg-[#fde8e8] text-[#a61b1b]",
        )}
      >
        {state === "done" ? <Check className="size-3.5" /> : state === "blocked" ? "!" : n}
      </span>
      <span className={cn("text-[15px]", state === "now" ? "font-semibold text-ink-900" : state === "blocked" ? "font-semibold text-[#a61b1b]" : "font-medium text-ink-600")}>
        {label}
        <span className="sr-only">{state === "done" ? " (done)" : state === "now" ? " (now)" : ""}</span>
      </span>
    </li>
  );
  const at = (n: number) => (n < current ? "done" : n === current ? "now" : "later");
  return (
    <ol className="space-y-3">
      {openOrders ? step(1, openOrders === 1 ? "1 open order" : `${openOrders} open orders`, "blocked") : step(1, "No open orders", "done")}
      {step(2, "Count your cash", openOrders ? "later" : at(2))}
      {step(3, "See the difference", at(3))}
      {step(4, "Done", current === 4 ? "done" : "later")}
    </ol>
  );
}

const grouped = (digits: string) => (digits ? Number(digits).toLocaleString("en-NG") : "");

/**
 * Close my day (R202). Blind count: the expected cash isn't shown until the count is in. The first count is
 * final; if it doesn't match and there's no note yet, the salesperson sees the difference, says what happened
 * and the day closes.
 */
export function CloseDayForm({ who, day, openOrders }: { who: string; day: string; openOrders: number }) {
  const [counted, setCounted] = useState("");
  const [state, action, pending] = useActionState(safeAction(closeMyDay), null);
  const result = state?.ok ? state.data : null;
  const error = state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null;
  const current = result?.closed ? 4 : result ? 3 : 2;

  const left = (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-ink-900">Close my day</h2>
        <p className="mt-1 text-sm text-ink-600">{who} · business day {day}</p>
      </div>
      <Steps current={current} openOrders={openOrders} />
      <p className="mt-auto rounded-lg bg-[#e8eefb] px-3.5 py-3 text-sm text-navy-800">Count before you see what the system expects. That protects you as much as the hotel.</p>
    </div>
  );

  if (result?.closed) {
    return (
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,28rem)]">
        {left}
        <div className="space-y-3 self-start">
          <FormMessage tone="success">Your day is closed. A manager will check it.</FormMessage>
        </div>
      </div>
    );
  }

  if (result) {
    const diff = result.countedKobo - result.expectedKobo;
    return (
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,28rem)]">
        {left}
        <form action={action} className="space-y-4">
          <input type="hidden" name="counted" value={String(result.countedKobo / 100)} />
          <dl className="grid grid-cols-3 gap-3 rounded-xl border border-hairline bg-white p-4">
            <div><dt className="text-[13px] text-ink-500">You counted</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatNaira(result.countedKobo)}</dd></div>
            <div><dt className="text-[13px] text-ink-500">Expected</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatNaira(result.expectedKobo)}</dd></div>
            <div><dt className="text-[13px] text-ink-500">{diff < 0 ? "Short" : "Over"}</dt><dd className={cn("mt-1 text-xl font-bold tabular-nums", diff < 0 ? "text-[#a61b1b]" : "text-[#8a4b06]")}>{diff < 0 ? "−" : "+"}{formatNaira(Math.abs(diff))}</dd></div>
          </dl>
          <p className="text-sm text-ink-600">Your count is saved and can&apos;t be changed. Say what happened, then close your day.</p>
          <label className="block space-y-1.5">
            <span className="block text-sm font-semibold text-ink-900">What happened?</span>
            <Textarea name="explanation" rows={3} maxLength={500} minLength={3} placeholder="e.g. Gave ₦500 too much change to a customer" required />
          </label>
          {error}
          <Button type="submit" size="lg" className="w-full" pending={pending}>Close my day</Button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)]">
      {left}
      <div className="flex flex-col gap-4">
        {openOrders ? (
          <FormMessage>{openOrders === 1 ? "1 order is" : `${openOrders} orders are`} still unpaid. Take payment or cancel {openOrders === 1 ? "it" : "them"} on the till first.</FormMessage>
        ) : null}
        <div className="space-y-1.5">
          <label htmlFor="counted-cash" className="block text-sm font-semibold text-ink-900">Cash in your drawer</label>
          <div className="flex h-[76px] items-center rounded-xl border-2 border-navy-900 bg-white px-4 focus-within:ring-2 focus-within:ring-navy-700/20">
            <span aria-hidden className="mr-2 text-[34px] font-bold text-ink-500">₦</span>
            <Input
              id="counted-cash"
              inputMode="none"
              autoComplete="off"
              value={grouped(counted)}
              onChange={(e) => setCounted(e.target.value.replace(/\D/g, "").slice(0, 10))}
              aria-describedby="counted-hint"
              className="h-full border-0 bg-transparent p-0 text-[34px] font-bold tabular-nums shadow-none focus:ring-0"
            />
          </div>
          <input type="hidden" name="counted" value={counted} />
          <p id="counted-hint" className="text-[13px] text-ink-500">All notes and coins, including the float.</p>
        </div>
        <label className="block space-y-1.5">
          <span className="block text-sm font-semibold text-ink-900">Note <span className="font-normal text-ink-500">(needed if it doesn&apos;t match)</span></span>
          <Textarea name="explanation" rows={3} maxLength={500} />
        </label>
        {error}
        <Button type="submit" size="lg" className="mt-auto w-full" pending={pending} disabled={!!openOrders || counted === ""}>Submit my count</Button>
      </div>
      <NumPad onChange={setCounted} doubleZero large maxLength={10} label="the cash you counted" className="content-start gap-2.5" />
    </form>
  );
}

/**
 * Mark checked (X11). A closing that matches is checked in one tap; one that's short or over needs a note
 * saying what the manager found.
 */
export function MarkChecked({ id, needsNote }: { id: string; needsNote: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(safeAction(signOffClosing), null);
  if (state?.ok) return <span className="text-sm font-semibold text-[#166534]">Checked</span>;
  if (needsNote && !open) return <Button size="sm" onClick={() => setOpen(true)}>Mark checked</Button>;
  return (
    <form action={action} className={cn("flex flex-wrap items-center justify-end gap-2", needsNote && "w-full min-w-64")}>
      <input type="hidden" name="id" value={id} />
      {needsNote ? (
        <Input name="note" aria-label="What you found" placeholder="What you found" className="h-9 min-w-0 flex-1" maxLength={300} minLength={3} required autoFocus />
      ) : null}
      <Button type="submit" size="sm" pending={pending}>Mark checked</Button>
      {needsNote ? <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button> : null}
      {state && !state.ok ? <p role="alert" className="w-full text-right text-sm text-danger-700">{state.message}</p> : null}
    </form>
  );
}
