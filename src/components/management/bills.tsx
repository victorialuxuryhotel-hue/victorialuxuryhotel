"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { formatDate, formatNaira } from "@/lib/format";
import { cancelBillAction, newBill, payBillAction } from "@/server/bills";

type Unpaid = { id: string; reference: string; guest_name: string; check_in: string; check_out: string; owed: number };

export function NewBillForm({ bookings, today }: { bookings: Unpaid[]; today: string }) {
  const [state, action, pending] = useActionState(newBill, null);
  const [picked, setPicked] = useState<string[]>([]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  const total = bookings.filter((b) => picked.includes(b.id)).reduce((n, b) => n + b.owed, 0);
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="Company" htmlFor="companyName" error={err("companyName")}><Input id="companyName" name="companyName" required maxLength={120} className="w-full" /></Field>
      <Field label="Attention" htmlFor="attention" optional hint="e.g. Mrs T. Ade · Admin"><Input id="attention" name="attention" maxLength={120} className="w-full" /></Field>
      <Field label="Valid until" htmlFor="validUntil" hint="On or before the first arrival" error={err("validUntil")}><Input id="validUntil" name="validUntil" type="date" min={today} required className="w-44" /></Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-900">Bookings</legend>
        {bookings.length ? (
          <ul className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
            {bookings.map((b) => (
              <li key={b.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" name="reservationIds" value={b.id} checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} className="size-4 accent-navy-900" />
                  <span className="min-w-0 flex-1"><b className="font-semibold">{b.reference}</b> · {b.guest_name} <span className="text-ink-500">· {formatDate(b.check_in, { year: false })}</span></span>
                  <span className="tabular-nums">{formatNaira(b.owed)}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">No unpaid bookings to bill. Make the bookings first.</p>
        )}
        {err("reservationIds") ? <p className="mt-1 text-sm text-danger-700">{err("reservationIds")}</p> : null}
      </fieldset>
      <div className="flex flex-col items-center gap-2">
        <Button type="submit" size="lg" className="w-full" pending={pending} disabled={!picked.length}>Make bill{picked.length ? ` · ${formatNaira(total)}` : ""}</Button>
        <p className="text-center text-xs text-ink-500">A bill is not a receipt. Receipts are issued when payment arrives.</p>
      </div>
    </form>
  );
}

/** Record a payment against a bill: split across its bookings in order, one receipt each. */
export function PayBillForm({ billId, owedKobo, terminals, today }: { billId: string; owedKobo: number; terminals: string[]; today: string }) {
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "pos_terminal">("bank_transfer");
  const [amount, setAmount] = useState(String(owedKobo / 100));
  const [ref, setRef] = useState("");
  const [sender, setSender] = useState("");
  const [slip, setSlip] = useState("");
  const [terminal, setTerminal] = useState(terminals[0] ?? "");
  const [seen, setSeen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const amountKobo = Math.round(Number(amount.replace(/[,\s₦]/g, "")) * 100) || 0;
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await payBillAction({ billId, amountKobo, method, reference: ref || null, senderName: sender || null, slipLast4: slip || null, terminal: terminal || null, paidOn: today, confirmReceived: method === "bank_transfer" ? seen : true });
      if (r.ok) setResult(r.data.receipts.map((x) => `${x.reference}: ${x.receiptNumber} (${formatNaira(x.amountKobo)})`).join(" · "));
      else setError(r.message);
    });
  if (result) return <FormMessage tone="success">Recorded. Receipts: {result}</FormMessage>;
  return (
    <div className="space-y-4">
      <Segmented label="How it was paid" value={method} onChange={setMethod} options={[{ value: "bank_transfer", label: "Transfer" }, { value: "cash", label: "Cash" }, { value: "pos_terminal", label: "POS / card" }]} />
      <Field label="Amount" htmlFor="bill-amount"><MoneyInput id="bill-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      {method === "bank_transfer" ? (
        <>
          <div className="flex flex-wrap gap-4">
            <Field label="Transfer reference" htmlFor="bill-ref"><Input id="bill-ref" value={ref} onChange={(e) => setRef(e.target.value)} className="w-52" /></Field>
            <Field label="Sender's name" htmlFor="bill-sender"><Input id="bill-sender" value={sender} onChange={(e) => setSender(e.target.value)} className="w-60" /></Field>
          </div>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-0.5 size-5 accent-navy-900" /><span><b>I&apos;ve seen {formatNaira(amountKobo)} arrive in the hotel&apos;s bank app</b></span></label>
        </>
      ) : method === "pos_terminal" ? (
        <div className="flex flex-wrap gap-4">
          <Field label="Slip: last 4 digits" htmlFor="bill-slip"><Input id="bill-slip" value={slip} onChange={(e) => setSlip(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-28 tabular-nums" /></Field>
          <Field label="Terminal" htmlFor="bill-terminal"><Select id="bill-terminal" value={terminal} onChange={(e) => setTerminal(e.target.value)} className="w-52">{terminals.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </div>
      ) : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="flex flex-col items-center gap-2">
        <Button size="lg" className="w-full" pending={pending} disabled={amountKobo <= 0 || (method === "bank_transfer" && !seen)} onClick={submit}>Record {formatNaira(amountKobo)}</Button>
        <p className="text-center text-xs text-ink-500">Split across the bookings in order; each gets its own receipt.</p>
      </div>
    </div>
  );
}

export function CancelBillButton({ id }: { id: string }) {
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!sure) return <Button variant="danger" onClick={() => setSure(true)}>Cancel bill</Button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm">Cancel this bill? The bookings keep their hold until it runs out.</span>
      <Button variant="danger" pending={pending} onClick={() => start(async () => { const r = await cancelBillAction(id); if (!r.ok) setError(r.message); })}>Cancel bill</Button>
      <Button variant="ghost" onClick={() => setSure(false)}>Keep</Button>
      {error ? <span className="text-sm text-danger-700">{error}</span> : null}
    </span>
  );
}
