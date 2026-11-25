"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { paymentMethod } from "@/domain/status";
import { owedOf } from "@/domain/next-step";
import { OFFLINE_REASON, useOnline } from "./connection";
import { formatNaira } from "@/lib/format";
import { recordOfflinePayment } from "@/server/payments";

export function OfflinePaymentForm({
  reservation,
  today,
}: {
  reservation: { id: string; reference: string; guestName: string; totalKobo: number; paidKobo: number; pendingKobo?: number; pendingChange?: { description: string; amountKobo: number } };
  today: string;
}) {
  const [state, action, pending] = useActionState(recordOfflinePayment, null);
  const [paymentId] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState<null | { amount: string; method: string; paidOn: string; reference: string }>(null);
  const [method, setMethod] = useState("cash");
  const online = useOnline();
  const transfer = method === "bank_transfer";
  const pos = method === "pos_terminal";
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setReview(null);
  }
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  const balance = owedOf(reservation);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!review) {
      const amount = Number(String(data.get("amount") ?? "").replace(/[,\s₦]/g, ""));
      setReview({
        amount: Number.isFinite(amount) && amount > 0 ? formatNaira(Math.round(amount * 100)) : String(data.get("amount")),
        method: paymentMethod[(data.get("method") as keyof typeof paymentMethod) ?? "other"],
        paidOn: String(data.get("paidOn") ?? ""),
        reference: String(data.get("reference") ?? "").trim(),
      });
      return;
    }
    startTransition(() => action(data));
  }

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="reservationId" value={reservation.id} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="rounded-md bg-ivory-100 p-4 text-sm">
        <p className="font-medium text-ink-900">{reservation.guestName} · <span className="font-mono">{reservation.reference}</span></p>
        <p className="mt-1 text-ink-600">
          Total {formatNaira(reservation.totalKobo)} · received {formatNaira(reservation.paidKobo)} ·{" "}
          <span className="font-medium text-warning-700">{formatNaira(balance)} owed</span>
        </p>
        {reservation.pendingChange ? (
          <p className="mt-2 text-ink-700">
            Includes {formatNaira(reservation.pendingChange.amountKobo)} for: <span className="font-medium">{reservation.pendingChange.description}</span>. It takes effect once this payment is recorded.
          </p>
        ) : null}
      </div>
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <div hidden={Boolean(review)} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Amount received (₦)" htmlFor="amount" hint="Bookings are paid in full, so this is everything owed." error={err("amount")}>
          <Input id="amount" name="amount" inputMode="decimal" value={String(balance / 100)} readOnly aria-readonly className="bg-ivory-100 font-semibold tabular-nums" />
        </Field>
        <Field label="Method" htmlFor="method" error={err("method")}>
          <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {(["cash", "bank_transfer", "pos_terminal", "other"] as const).map((m) => <option key={m} value={m}>{paymentMethod[m]}</option>)}
          </Select>
        </Field>
        <Field label="Date received" htmlFor="paidOn" error={err("paidOn")}>
          <Input id="paidOn" name="paidOn" type="date" defaultValue={today} max={today} required />
        </Field>
        <Field
          label={transfer ? "Transfer reference or sender's name" : pos ? "Last 4 digits of the POS slip" : "Reference"}
          optional={!transfer && !pos}
          htmlFor="ref"
          hint={
            transfer
              ? "As it appears in the hotel's bank app, so it can be matched to the statement."
              : pos
                ? "Once the terminal says Approved. The manager matches it to the terminal's report."
                : "Not needed for cash."
          }
          error={err("reference")}
        >
          <Input
            id="ref"
            name="reference"
            maxLength={pos ? 4 : 100}
            required={transfer || pos}
            minLength={transfer ? 3 : pos ? 4 : undefined}
            pattern={pos ? "[0-9]{4}" : undefined}
            inputMode={pos ? "numeric" : undefined}
          />
        </Field>
      </div>
      <Field label="Note" optional htmlFor="note"><Textarea id="note" name="notes" rows={2} maxLength={1000} /></Field>
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
        <Button type="submit" className="w-full sm:w-auto" disabled={!online} title={online ? undefined : OFFLINE_REASON}>Take payment</Button>
      </div>
      </div>
      {review ? (
        <div role="alertdialog" aria-labelledby="pay-review-title" className="space-y-4 rounded-card border border-gold-300 bg-gold-50 p-5">
          <p id="pay-review-title" className="text-lg font-semibold text-ink-900">
            Take {review.amount} {review.method.toLowerCase()} from {reservation.guestName}?
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-500">Booking</dt><dd className="font-mono">{reservation.reference}</dd>
            <dt className="text-ink-500">Received on</dt><dd>{review.paidOn}</dd>
            {review.reference ? (<><dt className="text-ink-500">Reference</dt><dd>{review.reference}</dd></>) : null}
          </dl>
          <p className="text-sm text-ink-600">Payments can&apos;t be edited once saved. If something is wrong later, a manager records a correction.</p>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:justify-end">
            <Button type="button" variant="secondary" size="lg" onClick={() => setReview(null)} disabled={pending}>Go back</Button>
            <Button type="submit" size="lg" pending={pending} disabled={!online} title={online ? undefined : OFFLINE_REASON}>Yes, take payment</Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
