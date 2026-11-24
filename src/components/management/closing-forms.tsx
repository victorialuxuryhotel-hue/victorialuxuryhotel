"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/safe-action";
import { FormMessage, Input, Textarea } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { closeMyDay, signOffClosing } from "@/server/pos";

export function CloseDayForm({ expectedCashKobo, openOrders }: { expectedCashKobo: number; openOrders: number }) {
  const [counted, setCounted] = useState("");
  const [state, action, pending] = useActionState(safeAction(closeMyDay), null);
  const countedKobo = counted === "" ? null : Math.round(Number(counted) * 100);
  const diff = countedKobo == null ? null : countedKobo - expectedCashKobo;
  if (state?.ok) return <FormMessage tone="success">Your day is closed. A manager will check and sign it off.</FormMessage>;
  return (
    <form action={action} className="space-y-4">
      {openOrders ? (
        <FormMessage>{openOrders === 1 ? "1 order is" : `${openOrders} orders are`} still unpaid. Take payment or cancel {openOrders === 1 ? "it" : "them"} on the till first.</FormMessage>
      ) : null}
      <label className="block max-w-xs">
        <span className="mb-1 block text-[13px] text-ink-700">Cash you counted (₦)</span>
        <Input name="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(expectedCashKobo / 100)} className="text-lg tabular-nums" required />
      </label>
      {diff != null ? (
        <p className={cn("text-lg font-semibold tabular-nums", diff === 0 ? "text-success-700" : "text-danger-700")}>
          {diff === 0 ? "Cash matches the till." : `${formatNaira(Math.abs(diff))} ${diff < 0 ? "short" : "over"}`}
        </p>
      ) : null}
      {diff != null && diff !== 0 ? (
        <label className="block">
          <span className="mb-1 block text-[13px] text-ink-700">What happened?</span>
          <Textarea name="explanation" rows={2} maxLength={500} placeholder="e.g. Gave ₦500 too much change to a customer" required />
        </label>
      ) : null}
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <Button type="submit" size="lg" pending={pending} disabled={!!openOrders || countedKobo == null}>Close my day</Button>
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
