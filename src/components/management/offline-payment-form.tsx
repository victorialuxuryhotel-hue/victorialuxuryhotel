"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { owedOf } from "@/domain/next-step";
import { formatNaira } from "@/lib/format";
import { recordOfflinePayment, reportDebitIssue } from "@/server/payments";
import { OFFLINE_REASON, useOnline } from "./connection";

type Method = "cash" | "bank_transfer" | "pos_terminal";
export type PaySettings = { bank: { name: string | null; number: string | null; accountName: string | null }; terminals: string[] };

const toKobo = (v: string) => {
  const n = Number(v.replace(/[,\s₦]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/** Where guests send a transfer. Placeholders until the owner fills in the bank details (Booking rules). */
export function BankLine({ bank }: { bank: PaySettings["bank"] }) {
  return (
    <p className="text-sm text-ink-600">
      Pay into: <span className="font-medium text-ink-900">{bank.name ?? "[HOTEL BANK]"} · {bank.number ?? "[ACCOUNT NUMBER]"} · {bank.accountName ?? "[ACCOUNT NAME]"}</span>
    </p>
  );
}

/**
 * Take payment at the desk (designs X4, X5; FUNCTIONALITY.md section 2). Cash, transfer or POS. Part payments are
 * allowed; overpaying isn't (cash: record what's owed and give change). Nothing is saved until the method's checks
 * pass, and every payment gets a numbered receipt.
 */
export function OfflinePaymentForm({
  reservation,
  today,
  settings,
}: {
  reservation: { id: string; reference: string; guestName: string; totalKobo: number; paidKobo: number; pendingKobo?: number; pendingChange?: { description: string; amountKobo: number } };
  today: string;
  settings: PaySettings;
}) {
  const [state, action, pending] = useActionState(recordOfflinePayment, null);
  const [paymentId] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState<Method>("cash");
  const balance = owedOf(reservation);
  const [amount, setAmount] = useState(String(balance / 100));
  const [given, setGiven] = useState("");
  const [seen, setSeen] = useState(false);
  const [debited, setDebited] = useState<null | "ask" | "done">(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dupOk = useRef<HTMLInputElement>(null);
  const online = useOnline();

  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  const duplicate = err("duplicate");
  const amountKobo = toKobo(amount);
  const fixed = Boolean(reservation.pendingChange);
  const change = method === "cash" ? toKobo(given) - amountKobo : 0;
  const label = method === "cash" ? "cash" : method === "bank_transfer" ? "transfer" : "POS payment";

  const pick = (m: Method) => {
    setMethod(m);
    setSeen(false);
    setDebited(null);
  };

  const flagDebit = async (data: FormData) => {
    setIssueError(null);
    const r = await reportDebitIssue({
      sourceType: "reservation",
      sourceId: reservation.id,
      amountKobo,
      terminal: String(data.get("terminal") ?? "") || undefined,
      slipLast4: String(data.get("slipLast4") ?? "") || undefined,
      note: "Declined at the desk but the guest says they were debited",
    });
    if (r.ok) setDebited("done");
    else setIssueError(r.message);
  };

  return (
    <form ref={form} action={action} className="space-y-5">
      <input type="hidden" name="reservationId" value={reservation.id} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="method" value={method} />
      <input ref={dupOk} type="hidden" name="duplicateOk" value="" />
      {method !== "bank_transfer" ? <input type="hidden" name="confirmReceived" value="on" /> : null}
      {method !== "bank_transfer" ? <input type="hidden" name="paidOn" value={today} /> : null}

      <div>
        <p className="text-lg font-bold text-ink-900">Take payment</p>
        <p className="mt-0.5 text-sm text-ink-600">
          {reservation.guestName} · {reservation.reference} · owes <span className="font-semibold text-[#8a4b06] tabular-nums">{formatNaira(balance)}</span>
        </p>
        {reservation.pendingChange ? (
          <p className="mt-2 text-sm text-ink-700">
            Includes {formatNaira(reservation.pendingChange.amountKobo)} for <span className="font-medium">{reservation.pendingChange.description}</span>. It takes effect once paid in full.
          </p>
        ) : null}
      </div>

      <Segmented
        label="How the guest paid"
        value={method}
        onChange={pick}
        options={[
          { value: "cash", label: "Cash" },
          { value: "bank_transfer", label: "Transfer" },
          { value: "pos_terminal", label: "POS / card" },
        ]}
      />

      {state && !state.ok && !duplicate ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Amount" htmlFor="amount" hint={fixed ? "Paid in full, with the change." : amountKobo < balance && amountKobo > 0 ? `Part payment: ${formatNaira(balance - amountKobo)} will still be owed.` : undefined} error={err("amount")}>
        <MoneyInput id="amount" name="amount" value={amount} readOnly={fixed} onChange={(e) => setAmount(e.target.value)} required />
      </Field>

      {method === "cash" ? (
        <Field label="Cash given" optional htmlFor="given" hint={change > 0 ? `Give ${formatNaira(change)} change.` : "To work out the change."}>
          <MoneyInput id="given" value={given} onChange={(e) => setGiven(e.target.value)} />
        </Field>
      ) : null}

      {method === "bank_transfer" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Field label="Transfer reference" htmlFor="ref" hint="From the guest's bank app or receipt" error={err("reference")}>
              <Input id="ref" name="reference" maxLength={80} className="w-56" autoComplete="off" />
            </Field>
            <Field label="Sender's name" htmlFor="sender" hint="If there's no reference" error={err("senderName")}>
              <Input id="sender" name="senderName" maxLength={80} className="w-64" defaultValue={reservation.guestName} />
            </Field>
          </div>
          <BankLine bank={settings.bank} />
          <div>
            <label className="flex gap-3 rounded-lg border border-hairline bg-white p-4 text-sm text-ink-800">
              <input type="checkbox" name="confirmReceived" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy-900" />
              <span>
                <span className="font-semibold text-ink-900">I&apos;ve seen {formatNaira(amountKobo)} arrive in the hotel&apos;s bank app</span> (not the guest&apos;s phone).
                <span className="mt-1 block text-ink-600">The GM or owner checks it against the bank statement tomorrow. It shows under Payments to confirm.</span>
              </span>
            </label>
            {err("confirmReceived") || err("seenInBankApp") ? <p className="mt-1 text-sm text-danger-700">{err("confirmReceived") ?? err("seenInBankApp")}</p> : null}
          </div>
          <Field label="Date received" htmlFor="paidOn" error={err("paidOn")}>
            <Input id="paidOn" name="paidOn" type="date" defaultValue={today} max={today} required className="w-44" />
          </Field>
        </div>
      ) : null}

      {method === "pos_terminal" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Field label="Slip: last 4 digits" htmlFor="slip" hint="Printed on the POS slip" error={err("slipLast4")}>
              <Input id="slip" name="slipLast4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoComplete="off" className="w-28 tabular-nums" />
            </Field>
            <Field label="Terminal" htmlFor="terminal" error={err("terminal")}>
              <Select id="terminal" name="terminal" required defaultValue={settings.terminals[0] ?? ""} className="w-60">
                {settings.terminals.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <p className="text-sm text-ink-600">Only record it once the terminal prints APPROVED. If it says declined but the guest was debited, don&apos;t record it: tap below.</p>
          {debited === "done" ? (
            <FormMessage tone="success">Flagged for the GM and owner to check with the bank. Nothing was recorded, and the guest still owes {formatNaira(balance)}.</FormMessage>
          ) : debited === "ask" ? (
            <div className="space-y-3 rounded-lg border border-[#f1b8b8] bg-white p-4">
              <p className="text-sm text-ink-900">Flag {formatNaira(amountKobo)} as declined but debited? No payment is recorded; the GM or owner checks it with the bank.</p>
              {issueError ? <FormMessage>{issueError}</FormMessage> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => form.current && void flagDebit(new FormData(form.current))}>Flag it</Button>
                <Button variant="ghost" onClick={() => setDebited(null)}>Back</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="px-0" onClick={() => setDebited("ask")}>Card declined but guest was debited</Button>
          )}
        </div>
      ) : null}

      {duplicate ? (
        <div role="alert" className="space-y-3 rounded-lg border border-[#f3d28a] bg-[#fff4dc] p-4 text-sm text-[#8a4b06]">
          <p>{duplicate}</p>
          <Button
            variant="secondary"
            pending={pending}
            onClick={() => {
              if (dupOk.current) dupOk.current.value = "1";
              form.current?.requestSubmit();
            }}
          >
            Record anyway
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2 pt-1">
        <Button
          type="submit"
          size="lg"
          className="w-full"
          pending={pending}
          disabled={!online || amountKobo <= 0 || amountKobo > balance || (method === "bank_transfer" && !seen) || (method === "pos_terminal" && debited === "done")}
          title={online ? undefined : OFFLINE_REASON}
        >
          Record {formatNaira(amountKobo)} {label}
        </Button>
        <p className="text-center text-xs text-ink-500">
          {amountKobo > balance ? `Only ${formatNaira(balance)} is owed.` : "A numbered receipt is created when you record it"}
        </p>
      </div>
    </form>
  );
}
