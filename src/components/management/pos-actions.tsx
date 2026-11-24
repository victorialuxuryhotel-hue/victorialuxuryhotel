"use client";

import { useActionState, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/form";
import { cancelOpenOrder, voidSale } from "@/server/pos";

export function PrintReceiptButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Print receipt
    </Button>
  );
}

export function VoidSaleForm({ id, total }: { id: string; total: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(voidSale, null);
  if (state?.ok) return <FormMessage tone="success">Sale voided. Stock has been put back.</FormMessage>;
  if (!open) return <Button variant="ghost" className="text-danger-700 hover:bg-danger-50" onClick={() => setOpen(true)}>Void this sale</Button>;
  return (
    <form action={action} className="space-y-3 rounded-md border border-danger-600/30 bg-danger-50 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-ink-900">Void this {total} sale? It stays on record as voided, and any stock it used is put back.</p>
      <label className="block">
        <span className="mb-1 block text-[13px] text-ink-700">Reason</span>
        <Input name="reason" placeholder="e.g. Rang up twice" required minLength={3} maxLength={200} />
      </label>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" pending={pending}>Void sale</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
      </div>
    </form>
  );
}

export function CancelOrderForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelOpenOrder, null);
  if (state?.ok) return <FormMessage tone="success">Order cancelled.</FormMessage>;
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>Cancel order</Button>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="Why? (optional)" className="min-w-0 flex-1 sm:w-56" />
      <Button type="submit" variant="danger" pending={pending}>Cancel order</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep</Button>
      {state && !state.ok ? <p className="w-full text-sm text-danger-700">{state.message}</p> : null}
    </form>
  );
}
