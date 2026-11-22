"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { updateBookingRules } from "@/server/settings";
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
};

/** Booking rules the hotel can change without a code release. */
export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const [state, action, pending] = useActionState(updateBookingRules, null);
  const err = (n: string) => fieldError(state, n);
  return (
    <form action={action} onSubmit={keepValues(action)} className="grid gap-6 p-5 md:grid-cols-2">
      {state?.ok ? <div className="md:col-span-2"><FormMessage tone="success">Booking rules saved.</FormMessage></div> : null}
      {state && !state.ok ? <div className="md:col-span-2"><FormMessage>{state.message}</FormMessage></div> : null}
      <Field label="Check-in from" htmlFor="cin" error={err("checkInTime")}><Input id="cin" name="checkInTime" type="time" defaultValue={rules.checkInTime.slice(0, 5)} /></Field>
      <Field label="Check-out by" htmlFor="cout" error={err("checkOutTime")}><Input id="cout" name="checkOutTime" type="time" defaultValue={rules.checkOutTime.slice(0, 5)} /></Field>
      <Field label="Website payment window (minutes)" htmlFor="whold" hint="How long an unpaid online booking holds a room." error={err("websiteHoldMinutes")}>
        <Input id="whold" name="websiteHoldMinutes" type="number" min={10} max={1440} defaultValue={rules.websiteHoldMinutes} />
      </Field>
      <Field label="Direct booking hold (hours)" htmlFor="shold" hint="Phone and WhatsApp bookings awaiting payment." error={err("staffHoldHours")}>
        <Input id="shold" name="staffHoldHours" type="number" min={1} max={336} defaultValue={rules.staffHoldHours} />
      </Field>
      <Field label="Free cancellation until (hours before check-in)" htmlFor="fch" hint="Guests who cancel online after this pay the fee below." error={err("freeCancelHours")}>
        <Input id="fch" name="freeCancelHours" type="number" min={0} max={720} defaultValue={rules.freeCancelHours} />
      </Field>
      <Field label="Late cancellation fee (% of the room price)" htmlFor="lcf" error={err("lateCancelFeePct")}>
        <Input id="lcf" name="lateCancelFeePct" type="number" min={0} max={100} defaultValue={rules.lateCancelFeePct} />
      </Field>
      <Field label="VAT rate (%)" htmlFor="vat" hint="Prices include VAT. Receipts and reports show the VAT part." error={err("vatRatePct")}>
        <Input id="vat" name="vatRatePct" type="number" min={0} max={50} step={0.5} defaultValue={rules.vatRateBp / 100} />
      </Field>
      <div className="hidden md:block" />
      <Field label="Cancellation policy wording" optional htmlFor="cpol" hint="Shown to guests before they pay. Leave empty to show the rule above in plain words." error={err("cancellationPolicy")} className="md:col-span-2">
        <Textarea id="cpol" name="cancellationPolicy" rows={3} maxLength={2000} defaultValue={rules.cancellationPolicy ?? ""} />
      </Field>
      <div className="flex justify-end md:col-span-2"><Button type="submit" pending={pending}>Save rules</Button></div>
    </form>
  );
}
