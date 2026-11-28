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

/** One group of rules: what it is on the left, its fields on the right (design R304). */
function RuleRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-hairline px-5 py-5 md:grid-cols-[17rem_minmax(0,1fr)]">
      <div>
        <h3 className="text-base font-bold text-ink-900">{title}</h3>
        <p className="mt-0.5 text-sm text-ink-600">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** A number with its unit after it ("30 minutes"), as wide as the number. */
function WithUnit({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      {children}
      <span className="text-[15px] text-ink-600">{unit}</span>
    </span>
  );
}

export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const [state, action, pending] = useActionState(updateBookingRules, null);
  const err = (n: string) => fieldError(state, n);
  return (
    <form action={action} onSubmit={keepValues(action)} className="overflow-clip rounded-xl border border-hairline bg-white">
      {state?.ok ? <div className="px-5 pt-5"><FormMessage tone="success">Booking rules saved.</FormMessage></div> : null}
      {state && !state.ok ? <div className="px-5 pt-5"><FormMessage>{state.message}</FormMessage></div> : null}
      <RuleRow title="Arrival and departure" description="Shown on the website and in emails">
        <Field label="Check-in from" htmlFor="cin" hint="00:00 means any time on the arrival day. The free-cancellation window counts back from this time." error={err("checkInTime")}>
          <Input id="cin" name="checkInTime" type="time" defaultValue={rules.checkInTime.slice(0, 5)} className="w-36 tabular-nums" />
        </Field>
        <Field label="Check-out by" htmlFor="cout" error={err("checkOutTime")}>
          <Input id="cout" name="checkOutTime" type="time" defaultValue={rules.checkOutTime.slice(0, 5)} className="w-36 tabular-nums" />
        </Field>
      </RuleRow>
      <RuleRow title="Holding unpaid bookings" description="Released automatically when time runs out">
        <Field label="Website payment window" htmlFor="whold" hint="How long an unpaid online booking keeps the room." error={err("websiteHoldMinutes")}>
          <WithUnit unit="minutes"><Input id="whold" name="websiteHoldMinutes" type="number" min={10} max={1440} defaultValue={rules.websiteHoldMinutes} className="w-24 tabular-nums" /></WithUnit>
        </Field>
        <Field label="Phone or WhatsApp hold" htmlFor="shold" hint="How long an unpaid desk booking keeps the room." error={err("staffHoldHours")}>
          <WithUnit unit="hours"><Input id="shold" name="staffHoldHours" type="number" min={1} max={336} defaultValue={rules.staffHoldHours} className="w-24 tabular-nums" /></WithUnit>
        </Field>
      </RuleRow>
      <RuleRow title="Cancellation" description="The website and guest emails show the wording">
        <Field label="Free until" htmlFor="fch" error={err("freeCancelHours")}>
          <WithUnit unit="hours before arrival"><Input id="fch" name="freeCancelHours" type="number" min={0} max={720} defaultValue={rules.freeCancelHours} className="w-24 tabular-nums" /></WithUnit>
        </Field>
        <Field label="Late fee" htmlFor="lcf" error={err("lateCancelFeePct")}>
          <WithUnit unit="% of the room price"><Input id="lcf" name="lateCancelFeePct" type="number" min={0} max={100} defaultValue={rules.lateCancelFeePct} className="w-24 tabular-nums" /></WithUnit>
        </Field>
        <Field label="Cancellation policy wording" optional htmlFor="cpol" hint="Leave empty to use the rule above." error={err("cancellationPolicy")} className="sm:col-span-2">
          <Textarea id="cpol" name="cancellationPolicy" rows={3} maxLength={2000} defaultValue={rules.cancellationPolicy ?? ""} />
        </Field>
      </RuleRow>
      <RuleRow title="VAT" description="Stays off until the hotel's TIN is entered">
        <Field label="TIN" htmlFor="tin" hint="Needed before VAT can show. Printed on receipts and bills when VAT is shown." error={err("taxId")}>
          <Input id="tin" name="taxId" defaultValue={rules.taxId ?? ""} maxLength={30} autoComplete="off" className="w-56" />
        </Field>
        <Field label="VAT rate" htmlFor="vat" hint="Used only when VAT is shown on receipts." error={err("vatRatePct")}>
          <WithUnit unit="%"><Input id="vat" name="vatRatePct" type="number" min={0} max={50} step={0.5} defaultValue={rules.vatRateBp / 100} className="w-24 tabular-nums" /></WithUnit>
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-700 sm:col-span-2">
          <input type="checkbox" name="vatOnReceipts" defaultChecked={rules.vatOnReceipts} className="mt-0.5 size-[18px] accent-navy-800" />
          <span>
            <span className="font-medium text-ink-900">Show VAT on receipts and reports</span>
            <span className="block text-xs text-ink-500">Only if the hotel is VAT-registered. Prices don&apos;t change either way.</span>
          </span>
        </label>
      </RuleRow>
      <div className="flex justify-end gap-3 px-5 py-4">
        <Button type="reset" variant="secondary">Discard</Button>
        <Button type="submit" pending={pending}>Save rules</Button>
      </div>
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
