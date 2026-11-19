"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { paymentMethod } from "@/domain/status";
import { formatNaira } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { recordOfflinePayment } from "@/server/payments";

/**
 * Offline payment. The confirmation checkbox is required by the server and the
 * database: staff must have actually received the money (cash in hand, or a
 * transfer visible in the hotel's bank account). A guest's screenshot is not proof.
 */
export function OfflinePaymentForm({
  reservation,
  today,
}: {
  reservation: { id: string; reference: string; guestName: string; totalKobo: number; paidKobo: number };
  today: string;
}) {
  const [state, action, pending] = useActionState(recordOfflinePayment, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  const balance = reservation.totalKobo - reservation.paidKobo;
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5">
      <input type="hidden" name="reservationId" value={reservation.id} />
      <div className="rounded-md bg-ivory-100 p-4 text-sm">
        <p className="font-medium text-ink-900">{reservation.guestName} · <span className="font-mono">{reservation.reference}</span></p>
        <p className="mt-1 text-ink-600">
          Total {formatNaira(reservation.totalKobo)} · received {formatNaira(reservation.paidKobo)} ·{" "}
          <span className="font-medium text-warning-700">balance {formatNaira(balance)}</span>
        </p>
      </div>
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Amount received (₦)" htmlFor="amount" required hint="Defaults to the balance due." error={err("amount")}>
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={String(balance / 100)} required />
        </Field>
        <Field label="Method" htmlFor="method" required error={err("method")}>
          <Select id="method" name="method" defaultValue="cash">
            {(["cash", "bank_transfer", "pos_terminal", "other"] as const).map((m) => <option key={m} value={m}>{paymentMethod[m]}</option>)}
          </Select>
        </Field>
        <Field label="Date received" htmlFor="paidOn" required error={err("paidOn")}>
          <Input id="paidOn" name="paidOn" type="date" defaultValue={today} max={today} required />
        </Field>
        <Field label="Reference" htmlFor="ref" hint="Transfer narration or POS slip number." error={err("reference")}>
          <Input id="ref" name="reference" maxLength={100} />
        </Field>
      </div>
      <Field label="Note" htmlFor="note"><Textarea id="note" name="notes" rows={2} maxLength={1000} /></Field>
      <div>
        <label className="flex gap-3 rounded-md border border-gold-300 bg-gold-50 p-4 text-sm text-ink-800">
          <input type="checkbox" name="confirmReceived" required className="mt-0.5 size-4 accent-navy-800" />
          <span>
            <span className="font-medium">I confirm the hotel has received this money.</span> Cash is in hand, or the transfer is visible in the
            hotel&apos;s bank account. A screenshot from the guest is not enough.
          </span>
        </label>
        {err("confirmReceived") ? <p className="mt-1 text-sm text-danger-700">{err("confirmReceived")}</p> : null}
      </div>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>Record payment</Button>
      </div>
    </form>
  );
}
