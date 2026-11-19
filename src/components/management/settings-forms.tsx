"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { staffRole, type StaffRole } from "@/domain/status";
import type { ActionResult } from "@/lib/errors";
import { updateBookingRules } from "@/server/settings";
import { inviteStaff, updateStaff } from "@/server/staff";
import { keepValues } from "@/lib/forms";

const fieldError = (state: ActionResult<unknown> | null, name: string) =>
  state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined;

export function InviteStaffForm() {
  const [state, action, pending] = useActionState(inviteStaff, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-4 p-5">
      {state?.ok ? <FormMessage tone="success">Invitation sent to {state.data.email}. They&apos;ll set their own password.</FormMessage> : null}
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-start">
        <Field label="Full name" htmlFor="sname" error={fieldError(state, "fullName")}>
          <Input id="sname" name="fullName" required aria-invalid={Boolean(fieldError(state, "fullName"))} />
        </Field>
        <Field label="Email" htmlFor="semail" error={fieldError(state, "email")}>
          <Input id="semail" name="email" type="email" required aria-invalid={Boolean(fieldError(state, "email"))} />
        </Field>
        <Field label="Role" htmlFor="srole">
          <Select id="srole" name="role" defaultValue="front_desk">
            {(Object.keys(staffRole) as StaffRole[]).map((r) => <option key={r} value={r}>{staffRole[r]}</option>)}
          </Select>
        </Field>
        <Button type="submit" pending={pending} className="sm:mt-7">Send invite</Button>
      </div>
    </form>
  );
}

export function StaffAccessForm({ staffId, role, isActive, isSelf }: { staffId: string; role: StaffRole; isActive: boolean; isSelf: boolean }) {
  const [state, action, pending] = useActionState(updateStaff, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="staffId" value={staffId} />
      <label className="sr-only" htmlFor={`role-${staffId}`}>Role</label>
      <Select id={`role-${staffId}`} name="role" defaultValue={role} className="h-8 w-auto text-xs">
        {(Object.keys(staffRole) as StaffRole[]).map((r) => <option key={r} value={r}>{staffRole[r]}</option>)}
      </Select>
      <label className="sr-only" htmlFor={`active-${staffId}`}>Access</label>
      <Select id={`active-${staffId}`} name="isActive" defaultValue={String(isActive)} disabled={isSelf} className="h-8 w-auto text-xs">
        <option value="true">Active</option>
        <option value="false">Deactivated</option>
      </Select>
      {isSelf ? <input type="hidden" name="isActive" value="true" /> : null}
      <Button type="submit" size="sm" variant="secondary" pending={pending}>Save</Button>
      {state && !state.ok ? <p role="alert" className="w-full text-right text-xs text-danger-700">{state.message}</p> : null}
      {state?.ok ? <p role="status" className="w-full text-right text-xs text-success-700">Saved</p> : null}
    </form>
  );
}

export type BookingRules = {
  checkInTime: string;
  checkOutTime: string;
  websiteHoldMinutes: number;
  staffHoldHours: number;
  cancellationPolicy: string | null;
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
      <Field label="Cancellation policy" htmlFor="cpol" hint="Shown to guests before they pay. Leave empty until the hotel confirms the wording." error={err("cancellationPolicy")} className="md:col-span-2">
        <Textarea id="cpol" name="cancellationPolicy" rows={3} maxLength={2000} defaultValue={rules.cancellationPolicy ?? ""} />
      </Field>
      <div className="flex justify-end md:col-span-2"><Button type="submit" pending={pending}>Save rules</Button></div>
    </form>
  );
}
