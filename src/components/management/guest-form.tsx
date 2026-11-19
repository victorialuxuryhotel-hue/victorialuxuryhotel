"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { updateGuest } from "@/server/reservations";
import { keepValues } from "@/lib/forms";

export function GuestEditForm({ guest }: { guest: { id: string; name: string; phone?: string; email?: string; notes?: string } }) {
  const [state, action, pending] = useActionState(updateGuest, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-4 p-6">
      <input type="hidden" name="guestId" value={guest.id} />
      <p className="text-sm font-medium text-ink-900">Contact details</p>
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Saved.</FormMessage> : null}
      <Field label="Full name" htmlFor="gname" error={err("fullName")}><Input id="gname" name="fullName" defaultValue={guest.name} required /></Field>
      <Field label="Phone" htmlFor="gphone" error={err("phone")}><Input id="gphone" name="phone" type="tel" defaultValue={guest.phone} /></Field>
      <Field label="Email" htmlFor="gemail" error={err("email")}><Input id="gemail" name="email" type="email" defaultValue={guest.email} /></Field>
      <Field label="Notes" htmlFor="gnotes" hint="Preferences only. Never record ID or card numbers here."><Textarea id="gnotes" name="notes" rows={3} defaultValue={guest.notes} maxLength={1000} /></Field>
      <Button type="submit" variant="secondary" pending={pending} className="w-full">Save changes</Button>
    </form>
  );
}
