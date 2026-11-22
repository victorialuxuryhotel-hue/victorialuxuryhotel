"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { keepValues } from "@/lib/forms";
import { MobileActionBar } from "./mobile-action-bar";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Only what the hotel needs to confirm the stay and reach the guest. */
export function GuestDetailsForm({
  action,
  hidden,
  cancellationPolicy,
  total,
}: {
  action: Action;
  hidden: Record<string, string>;
  cancellationPolicy: string | null;
  /** Shown in the pinned bar on phones. */
  total?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="space-y-8" noValidate>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
      <section>
        <h2 className="font-display text-[1.875rem] text-navy-950 sm:text-3xl">Your details</h2>
        <p className="mt-1 text-sm text-ink-500">We&apos;ll send your confirmation to this email.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" required error={err("fullName")} className="sm:col-span-2">
            <Input id="name" name="fullName" autoComplete="name" required className="h-12" aria-invalid={Boolean(err("fullName"))} />
          </Field>
          <Field label="Email" htmlFor="email" required error={err("email")}>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className="h-12" aria-invalid={Boolean(err("email"))} />
          </Field>
          <Field label="Phone" htmlFor="phone" required hint="Include the country code, e.g. +234." error={err("phone")}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required className="h-12" aria-invalid={Boolean(err("phone"))} />
          </Field>
        </div>
      </section>
      <Field label="Special requests (optional)" htmlFor="requests" hint="Arrival time, accessibility needs, anything we should know. We'll do our best.">
        <Textarea id="requests" name="specialRequests" rows={3} maxLength={1000} />
      </Field>
      <section className="rounded-card bg-ivory-100 p-5 text-sm text-ink-700">
        <p className="font-medium text-ink-900">Cancellation policy</p>
        <p className="mt-1 whitespace-pre-line">
          {cancellationPolicy ?? "Please contact the hotel for cancellation terms before you book."}
        </p>
      </section>
      <div>
        <label className="flex items-start gap-3 text-sm text-ink-700">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4 accent-navy-800" />
          I agree to the cancellation policy and booking terms.
        </label>
        {err("acceptTerms") ? <p className="mt-1 text-sm text-danger-700">{err("acceptTerms")}</p> : null}
      </div>
      <Button type="submit" size="lg" pending={pending} className={total ? "hidden md:inline-flex" : "w-full sm:w-auto"}>Continue to payment</Button>
      {total ? (
        <MobileActionBar label="Total" amount={total}>
          <Button type="submit" variant="accent" size="lg" pending={pending} className="shrink-0 px-5">Continue to payment</Button>
        </MobileActionBar>
      ) : null}
    </form>
  );
}
