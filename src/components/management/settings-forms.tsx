"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { savePaymentDetails, updateBookingRules } from "@/server/settings";
import { keepValues } from "@/lib/forms";

const fieldError = (state: ActionResult<unknown> | null, name: string) =>
  state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined;

export type BookingRules = {
  checkInTime: string;
  checkOutTime: string;
  websiteHoldMinutes: number;
  staffHoldHours: number;
  cancellationPolicy: string | null;
  freeCancelHours: number;
  lateCancelFeePct: number;
  vatRateBp: number;
  vatOnReceipts: boolean;
  taxId: string | null;
};

export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const [state, action, pending] = useActionState(updateBookingRules, null);
  const err = (n: string) => fieldError(state, n);
  return (
    <form action={action} onSubmit={keepValues(action)} className="grid gap-6 p-5 md:grid-cols-2">
      {state?.ok ? <div className="md:col-span-2"><FormMessage tone="success">Booking rules saved.</FormMessage></div> : null}
      {state && !state.ok ? <div className="md:col-span-2"><FormMessage>{state.message}</FormMessage></div> : null}
      <Field label="Check-in from" htmlFor="cin" hint="00:00 means any time on the arrival day. The free-cancellation window counts back from this time." error={err("checkInTime")}><Input id="cin" name="checkInTime" type="time" defaultValue={rules.checkInTime.slice(0, 5)} /></Field>
      <Field label="Check-out by" htmlFor="cout" error={err("checkOutTime")}><Input id="cout" name="checkOutTime" type="time" defaultValue={rules.checkOutTime.slice(0, 5)} /></Field>
      <Field label="Website payment window (minutes)" htmlFor="whold" hint="How long an unpaid online booking keeps the room." error={err("websiteHoldMinutes")}>
        <Input id="whold" name="websiteHoldMinutes" type="number" min={10} max={1440} defaultValue={rules.websiteHoldMinutes} />
      </Field>
      <Field label="Direct booking hold (hours)" htmlFor="shold" hint="How long an unpaid desk booking keeps the room." error={err("staffHoldHours")}>
        <Input id="shold" name="staffHoldHours" type="number" min={1} max={336} defaultValue={rules.staffHoldHours} />
      </Field>
      <Field label="Free cancellation until (hours before check-in)" htmlFor="fch" error={err("freeCancelHours")}>
        <Input id="fch" name="freeCancelHours" type="number" min={0} max={720} defaultValue={rules.freeCancelHours} />
      </Field>
      <Field label="Late cancellation fee (% of the room price)" htmlFor="lcf" error={err("lateCancelFeePct")}>
        <Input id="lcf" name="lateCancelFeePct" type="number" min={0} max={100} defaultValue={rules.lateCancelFeePct} />
      </Field>
      <Field label="VAT rate (%)" htmlFor="vat" hint="Used only when VAT is shown on receipts." error={err("vatRatePct")}>
        <Input id="vat" name="vatRatePct" type="number" min={0} max={50} step={0.5} defaultValue={rules.vatRateBp / 100} />
      </Field>
      <Field label="Tax ID (TIN)" optional htmlFor="tin" hint="Printed on receipts and bills when VAT is shown. Needed before VAT can be switched on." error={err("taxId")}>
        <Input id="tin" name="taxId" defaultValue={rules.taxId ?? ""} maxLength={30} autoComplete="off" />
      </Field>
      <label className="flex items-start gap-3 self-end pb-2 text-sm text-ink-700">
        <input type="checkbox" name="vatOnReceipts" defaultChecked={rules.vatOnReceipts} className="mt-0.5 size-4 accent-navy-800" />
        <span>
          <span className="font-medium text-ink-900">Show VAT on receipts and reports</span>
          <span className="block text-xs text-ink-500">Only if the hotel is VAT-registered. Prices don&apos;t change either way.</span>
        </span>
      </label>
      <Field label="Cancellation policy wording" optional htmlFor="cpol" hint="Leave empty to use the rule above." error={err("cancellationPolicy")} className="md:col-span-2">
        <Textarea id="cpol" name="cancellationPolicy" rows={3} maxLength={2000} defaultValue={rules.cancellationPolicy ?? ""} />
      </Field>
      <div className="flex justify-end md:col-span-2"><Button type="submit" pending={pending}>Save rules</Button></div>
    </form>
  );
}

/** Bank details (shown for transfers, placeholders while empty) and the POS terminals list (FUNCTIONALITY.md section 0, 2). */
export function PaymentDetailsForm({ value }: { value: { bank: { name: string | null; number: string | null; accountName: string | null }; terminals: string[] } }) {
  const [state, action, pending] = useActionState(savePaymentDetails, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Payment details saved.</FormMessage> : null}
      <div className="flex flex-wrap gap-4">
        <Field label="Bank" htmlFor="bankName" optional error={err("bankName")}>
          <Input id="bankName" name="bankName" defaultValue={value.bank.name ?? ""} maxLength={60} className="w-56" />
        </Field>
        <Field label="Account number" htmlFor="bankAccountNumber" optional hint="10 digits" error={err("bankAccountNumber")}>
          <Input id="bankAccountNumber" name="bankAccountNumber" inputMode="numeric" defaultValue={value.bank.number ?? ""} maxLength={14} className="w-40 tabular-nums" />
        </Field>
        <Field label="Account name" htmlFor="bankAccountName" optional error={err("bankAccountName")}>
          <Input id="bankAccountName" name="bankAccountName" defaultValue={value.bank.accountName ?? ""} maxLength={80} className="w-72" />
        </Field>
      </div>
      <p className="text-sm text-ink-600">While these are empty, the transfer screens show [HOTEL BANK] · [ACCOUNT NUMBER] · [ACCOUNT NAME].</p>
      <Field label="POS terminals" htmlFor="terminals" hint="One per line, e.g. Front desk Moniepoint. Staff pick one when they record a POS payment." error={err("terminals")}>
        <Textarea id="terminals" name="terminals" defaultValue={value.terminals.join("\n")} rows={3} className="w-80" />
      </Field>
      <Button type="submit" pending={pending}>Save payment details</Button>
    </form>
  );
}
