"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { MobileActionBar } from "./mobile-action-bar";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function GuestDetailsForm({
  action,
  hidden,
  cancellationPolicy,
  total,
  extras = [],
  nights = 1,
  chosen,
  onToggle,
}: {
  action: Action;
  hidden: Record<string, string>;
  cancellationPolicy: string | null;
  total?: string;
  extras?: Array<{ id: string; name: string; price_kobo: number; per_night: number }>;
  nights?: number;
  /** Extras ticked, kept by the page so the totals can follow (see DetailsStep). */
  chosen?: Set<string>;
  onToggle?: (id: string, on: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // A field's error clears as soon as the guest edits that field; a new submit shows fresh errors.
  const [edited, setEdited] = useState<{ for: typeof state; names: Set<string> }>({ for: null, names: new Set() });
  const editedNames = edited.for === state ? edited.names : new Set<string>();
  const err = (n: string) => (state && !state.ok && !editedNames.has(n) ? state.fieldErrors?.[n]?.[0] : undefined);
  const onEdit = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (name && state && !state.ok && state.fieldErrors?.[name]) setEdited({ for: state, names: new Set([...editedNames, name]) });
  };
  // On a phone the guest is down by the button: bring the first problem into view.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state || state.ok) return;
    const target = form.current?.querySelector<HTMLElement>("[aria-invalid=true], [data-error], [role=alert]");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target instanceof HTMLInputElement) target.focus({ preventScroll: true });
  }, [state]);
  return (
    <form ref={form} action={formAction} onSubmit={keepValues(formAction)} onChange={onEdit} className="space-y-6" noValidate>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state && !state.ok && !state.fieldErrors ? <div role="alert"><FormMessage>{state.message}</FormMessage></div> : null}
      <section>
        <h1 className="font-display text-[2rem] leading-tight text-navy-950">Your details</h1>
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
                <input
                  type="checkbox"
                  name="extra"
                  value={e.id}
                  checked={chosen ? chosen.has(e.id) : undefined}
                  onChange={onToggle ? (ev) => onToggle(e.id, ev.target.checked) : undefined}
                  className="size-5 shrink-0 accent-navy-800"
                />
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
      <Field label="Promo code" optional htmlFor="promo" error={err("promoCode")} className="sm:max-w-xs">
        <Input id="promo" name="promoCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} className="h-12 uppercase" aria-invalid={Boolean(err("promoCode"))} />
      </Field>
      <Field label="Special requests" optional htmlFor="requests" hint="Arrival time or anything we should know.">
        <Textarea id="requests" name="specialRequests" rows={3} maxLength={1000} />
      </Field>
      <section className="rounded-xl bg-ivory-100 px-[18px] py-4 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">Cancellation policy</p>
        <p className="mt-1 leading-relaxed whitespace-pre-line">
          {cancellationPolicy ?? "Please contact the hotel for cancellation terms before you book."}
        </p>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 py-1">
          <input type="checkbox" name="acceptTerms" required className="size-5 shrink-0 accent-navy-800" aria-invalid={Boolean(err("acceptTerms"))} />
          I agree to the cancellation policy.
        </label>
        {err("acceptTerms") ? <p data-error className="mt-1 text-danger-700">{err("acceptTerms")}</p> : null}
      </section>
      <Button type="submit" size="lg" pending={pending} className={total ? "hidden md:inline-flex" : "w-full sm:w-auto"}>Continue to payment</Button>
      {total ? (
        <MobileActionBar label="Total" amount={total}>
          <Button type="submit" variant="accent" size="lg" pending={pending} className="shrink-0 px-5">Continue to payment</Button>
        </MobileActionBar>
      ) : null}
    </form>
  );
}
