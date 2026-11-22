"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { correctPayment } from "@/server/payments";

/**
 * Managers only. A recorded payment is never edited: a correction is saved
 * as its own entry (with its own receipt number) that reduces what was
 * received. The original stays visible so the history adds up.
 */
export function CorrectPaymentForm({
  paymentId,
  reservationId,
  receiptNumber,
  correctableKobo,
}: {
  paymentId: string;
  reservationId: string;
  receiptNumber?: string;
  correctableKobo: number;
}) {
  const [state, action, pending] = useActionState(correctPayment, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  const prefix = `fix-${paymentId.slice(0, 8)}`;
  return (
    <details className="w-full text-sm">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center font-medium text-navy-800 hover:text-navy-600">Correct this payment</summary>
      {state?.ok ? (
        <div className="mt-2">
          <FormMessage tone="success">Correction recorded. Receipt {state.data.receiptNumber}.</FormMessage>
        </div>
      ) : (
        <form action={action} onSubmit={keepValues(action)} className="mt-2 space-y-3 rounded-card border border-ivory-200 bg-ivory-50 p-4">
          <input type="hidden" name="paymentId" value={paymentId} />
          <input type="hidden" name="reservationId" value={reservationId} />
          <p className="text-ink-700">
            Use this when {receiptNumber ? <span className="font-mono">{receiptNumber}</span> : "this payment"} was recorded wrongly, for
            example the wrong amount was typed. The original stays on record; the correction is subtracted from what was received.
          </p>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field label="Amount to take off (₦)" htmlFor={`${prefix}-amount`} hint={`Up to ${formatNaira(correctableKobo)}`} error={err("amount")}>
              <Input id={`${prefix}-amount`} name="amount" inputMode="decimal" required />
            </Field>
            <Field label="What was wrong" htmlFor={`${prefix}-reason`} hint="Recorded in the history." error={err("reason")}>
              <Input id={`${prefix}-reason`} name="reason" required minLength={5} maxLength={500} placeholder="e.g. Typed ₦100,000, guest paid ₦90,000" />
            </Field>
          </div>
          {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
          <Button type="submit" variant="secondary" pending={pending} className="w-full sm:w-auto">Record correction</Button>
        </form>
      )}
    </details>
  );
}
