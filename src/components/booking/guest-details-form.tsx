"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { MobileActionBar } from "./mobile-action-bar";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Only what the hotel needs to confirm the stay and reach the guest. */
export function GuestDetailsForm({
  action,
  hidden,
  cancellationPolicy,
  total,
  extras = [],
  nights = 1,
}: {
  action: Action;
  hidden: Record<string, string>;
  cancellationPolicy: string | null;
  /** Shown in the pinned bar on phones. */
  total?: string;
  extras?: Array<{ id: string; name: string; price_kobo: number; per_night: number }>;
  nights?: number;
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
          <Field label="Full name" htmlFor="name" error={err("fullName")} className="sm:col-span-2">
            <Input id="name" name="fullName" autoComplete="name" required className="h-12" aria-invalid={Boolean(err("fullName"))} />
          </Field>
          <Field label="Email" htmlFor="email" error={err("email")}>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className="h-12" aria-invalid={Boolean(err("email"))} />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="Include the country code, e.g. +234." error={err("phone")}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required className="h-12" aria-invalid={Boolean(err("phone"))} />
          </Field>
        </div>
      </section>
      {extras.length ? (
        <fieldset>
          <legend className="font-display text-2xl text-navy-950">Add to your stay</legend>
          <div className="mt-3 divide-y divide-hairline rounded-md border border-hairline">
            {extras.map((e) => (
              <label key={e.id} className="flex min-h-13 cursor-pointer items-center gap-3 px-4 py-3 has-[:checked]:bg-navy-50">
                <input type="checkbox" name="extra" value={e.id} className="size-5 shrink-0 accent-navy-800" />
                <span className="flex-1 text-[15px] text-ink-900">{e.name}</span>
                <span className="text-right text-sm tabular-nums text-ink-700">
                  {formatNaira(e.price_kobo * (e.per_night ? nights : 1))}
                  {e.per_night ? <span className="block text-xs text-ink-500">{formatNaira(e.price_kobo)} a night</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Field label="Promo code" optional htmlFor="promo" hint="Any discount is applied on the next step." error={err("promoCode")} className="sm:max-w-xs">
        <Input id="promo" name="promoCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} className="h-12 uppercase" />
      </Field>
      <Field label="Special requests" optional htmlFor="requests" hint="Arrival time, accessibility needs, anything we should know. We'll do our best.">
        <Textarea id="requests" name="specialRequests" rows={3} maxLength={1000} />
      </Field>
      <section className="rounded-card bg-ivory-100 p-5 text-sm text-ink-700">
        <p className="font-medium text-ink-900">Cancellation policy</p>
        <p className="mt-1 whitespace-pre-line">
          {cancellationPolicy ?? "Please contact the hotel for cancellation terms before you book."}
        </p>
      </section>
      <div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-sm text-ink-700">
          <input type="checkbox" name="acceptTerms" required className="size-5 shrink-0 accent-navy-800" />
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
