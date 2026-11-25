"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/safe-action";
import { FormMessage, Input, Textarea } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { closeMyDay, signOffClosing } from "@/server/pos";

/**
 * Blind count: the expected cash isn't shown until the count is in. The first count is final;
 * if it doesn't match, the salesperson says what happened and the day closes.
 */
export function CloseDayForm({ openOrders }: { openOrders: number }) {
  const [counted, setCounted] = useState("");
  const [state, action, pending] = useActionState(safeAction(closeMyDay), null);
  const result = state?.ok ? state.data : null;
  if (result?.closed) return <FormMessage tone="success">Your day is closed. A manager will check and sign it off.</FormMessage>;
  if (result && !result.closed) {
    const diff = result.countedKobo - result.expectedKobo;
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="counted" value={String(result.countedKobo / 100)} />
        <dl className="grid max-w-md grid-cols-3 gap-3 text-sm">
          <div><dt className="text-ink-500">You counted</dt><dd className="text-lg font-semibold tabular-nums">{formatNaira(result.countedKobo)}</dd></div>
          <div><dt className="text-ink-500">Expected</dt><dd className="text-lg font-semibold tabular-nums">{formatNaira(result.expectedKobo)}</dd></div>
          <div><dt className="text-ink-500">{diff < 0 ? "Short" : "Over"}</dt><dd className="text-lg font-semibold tabular-nums text-danger-700">{formatNaira(Math.abs(diff))}</dd></div>
        </dl>
        <p className="text-sm text-ink-600">Your count is saved and can&apos;t be changed. Say what happened, then close your day.</p>
        <label className="block">
          <span className="mb-1 block text-[13px] text-ink-700">What happened?</span>
          <Textarea name="explanation" rows={2} maxLength={500} minLength={3} placeholder="e.g. Gave ₦500 too much change to a customer" required />
        </label>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        <Button type="submit" size="lg" pending={pending}>Close my day</Button>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {openOrders ? (
        <FormMessage>{openOrders === 1 ? "1 order is" : `${openOrders} orders are`} still unpaid. Take payment or cancel {openOrders === 1 ? "it" : "them"} on the till first.</FormMessage>
      ) : null}
      <label className="block max-w-xs">
        <span className="mb-1 block text-[13px] text-ink-700">Cash you counted (₦)</span>
        <Input name="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} className="text-lg tabular-nums" autoComplete="off" required />
      </label>
      <p className="text-sm text-ink-600">Count everything in your drawer first. The till&apos;s figure is shown after you submit, and your first count is the one that&apos;s kept.</p>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <Button type="submit" size="lg" pending={pending} disabled={!!openOrders || counted === ""}>Submit my count</Button>
    </form>
  );
}

export function SignOffForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(safeAction(signOffClosing), null);
  if (state?.ok) return <span className="text-sm text-success-700">Signed off</span>;
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Sign off</Button>;
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="note" placeholder="Note (optional)" className="h-10 min-w-0 flex-1" maxLength={300} />
      <Button type="submit" size="sm" pending={pending}>Sign off</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Not yet</Button>
      {state && !state.ok ? <p className="w-full text-sm text-danger-700">{state.message}</p> : null}
    </form>
  );
}
