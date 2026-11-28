"use client";

import { useActionState, useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/safe-action";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { NumPad } from "@/components/ui/num-pad";
import { cn } from "@/lib/utils/cn";
import { cancelOpenOrder, voidSale } from "@/server/pos";

export function PrintReceiptButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Print receipt
    </Button>
  );
}

const REASONS = [
  ["rung_up_wrongly", "Rung up wrongly"],
  ["customer_changed_mind", "Customer changed mind"],
  ["item_unavailable", "Item unavailable"],
  ["other", "Other"],
] as const;

/**
 * Void a paid sale (design X9; FUNCTIONALITY.md section 3). The salesperson picks the reason and, for cash, ticks
 * that the money went back. On a shared station a manager who didn't make the sale picks their name and enters
 * their PIN here; that doesn't change who is signed in. Off a station, the signed-in manager approves.
 */
export function VoidSaleForm({
  id, total, cash, soldLine, approvers, onStation, sellerId,
}: {
  id: string; total: string; cash: boolean; soldLine: string; approvers: { id: string; fullName: string }[]; onStation: boolean; sellerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("rung_up_wrongly");
  const [note, setNote] = useState("");
  const [returned, setReturned] = useState(false);
  const [approver, setApprover] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const eligible = approvers.filter((a) => a.id !== sellerId);

  if (done) return <FormMessage tone="success">Sale voided, approved by {done}. Stock has been put back.</FormMessage>;
  if (!open) return <Button variant="danger" onClick={() => setOpen(true)}>Void sale</Button>;

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await voidSale({ id, reasonCode: reason, note: note || undefined, cashReturned: cash ? returned : undefined, approverId: approver ?? undefined, approverPin: pin || undefined });
      if (r.ok) setDone(r.data.approvedBy);
      else {
        setError(r.message);
        setPin("");
      }
    });
  const ready = (!cash || returned) && (reason !== "other" || note.trim().length >= 3) && (!onStation || (approver && pin.length >= 4));

  return (
    <div className="w-full max-w-md space-y-4 rounded-xl border border-hairline bg-white p-5">
      <div>
        <p className="text-lg font-bold text-ink-900">Void {total}</p>
        <p className="text-sm text-ink-600">{soldLine}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Field label="Reason" htmlFor={`reason-${id}`}>
          <Select id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="w-60">
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Note" htmlFor={`note-${id}`} optional={reason !== "other"}>
          <Input id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} className="w-64" />
        </Field>
      </div>
      {cash ? (
        <label className="flex items-center gap-3 text-sm font-medium text-ink-900">
          <input type="checkbox" checked={returned} onChange={(e) => setReturned(e.target.checked)} className="size-5 accent-navy-900" />
          Cash returned to the customer
        </label>
      ) : null}
      {onStation ? (
        <div className="space-y-3 border-t border-hairline pt-4">
          <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Manager approves</p>
          {eligible.length ? (
            <div className="flex flex-wrap gap-2">
              {eligible.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={approver === a.id}
                  onClick={() => { setApprover(a.id); setPin(""); }}
                  className={cn("h-11 w-fit rounded-lg border px-4 text-[15px] font-semibold", approver === a.id ? "border-navy-900 bg-[#e8eefb] text-navy-900" : "border-hairline text-ink-900")}
                >
                  {a.fullName}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-600">No manager has a PIN yet. The owner sets PINs in Staff &amp; access.</p>
          )}
          {approver ? (
            <>
              <div className="flex gap-3" aria-hidden>
                {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
                  <span key={i} className={cn("size-4 rounded-full border-2 border-navy-900", i < pin.length ? "bg-navy-900" : "bg-white")} />
                ))}
              </div>
              <NumPad onChange={setPin} maxLength={6} label="the manager's PIN" />
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>Keep the sale</Button>
        <Button variant="danger" pending={pending} disabled={!ready} onClick={submit}>Void {total}</Button>
      </div>
    </div>
  );
}

export function CancelOrderForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(safeAction(cancelOpenOrder), null);
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
