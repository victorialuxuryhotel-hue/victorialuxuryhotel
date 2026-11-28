"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { keepValues } from "@/lib/forms";
import { StayAside } from "./booking-ui";
import { MobileActionBar } from "./mobile-action-bar";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** The "Your stay" box beside the form, with the form's own Continue button (design G5). */
export type DetailsSummary = { rows: Array<[string, string]>; totalKobo: number; backHref: string; phoneLabel: string };

/** Booking step 2, your details (designs G5, M2). */
export function GuestDetailsForm({
  action,
  hidden,
  cancellationPolicy,
  extras = [],
  nights = 1,
  chosen,
  onToggle,
  summary,
  note,
}: {
  action: Action;
  hidden: Record<string, string>;
  cancellationPolicy: string | null;
  extras?: Array<{ id: string; name: string; price_kobo: number; per_night: number }>;
  nights?: number;
  /** Extras ticked, kept by the page so the totals can follow (see DetailsStep). */
  chosen?: Set<string>;
  onToggle?: (id: string, on: boolean) => void;
  summary?: DetailsSummary;
  note?: React.ReactNode;
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
    <form
      ref={form}
      action={formAction}
      onSubmit={keepValues(formAction)}
      onChange={onEdit}
      className={summary ? "grid items-start gap-6 lg:grid-cols-[1fr_360px] lg:gap-8" : undefined}
      noValidate
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex min-w-0 flex-col gap-[22px]">
        {state && !state.ok && !state.fieldErrors ? <div role="alert"><FormMessage>{state.message}</FormMessage></div> : null}
        <h1 className="max-lg:sr-only font-display text-[40px] leading-tight font-semibold text-ink-900">Your details</h1>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={err("fullName")}>
            <Input id="name" name="fullName" autoComplete="name" required aria-invalid={Boolean(err("fullName"))} />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="We'll send a WhatsApp if anything changes. Include the country code, e.g. +234." error={err("phone")}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required aria-invalid={Boolean(err("phone"))} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Your confirmation and receipt go here" error={err("email")}>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required aria-invalid={Boolean(err("email"))} />
          </Field>
        </div>
        {extras.length ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-lg font-bold text-ink-900">Add to your stay</legend>
            {extras.map((e) => (
              <label
                key={e.id}
                className="flex min-h-14 cursor-pointer items-center gap-3.5 rounded-xl border border-hairline bg-white px-4 py-3.5 has-[:checked]:border-navy-700 has-[:checked]:bg-[#f3f6fd] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500"
              >
                <span className="relative flex size-[22px] shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    name="extra"
                    value={e.id}
                    checked={chosen ? chosen.has(e.id) : undefined}
                    onChange={onToggle ? (ev) => onToggle(e.id, ev.target.checked) : undefined}
                    className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md border-2 border-[#bdb7a8] bg-white checked:border-navy-700 checked:bg-navy-700"
                  />
                  <Check className="pointer-events-none relative size-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
                </span>
                <span className="flex flex-1 flex-col">
                  <b className="text-[15px]">{e.name}</b>
                  <span className="text-[13px] text-muted">{e.per_night ? `${formatNaira(e.price_kobo)} a night` : "Once for your stay"}</span>
                </span>
                <b className="tabular-nums">{formatNaira(e.price_kobo * (e.per_night ? nights : 1))}</b>
              </label>
            ))}
          </fieldset>
        ) : null}
        <Field label="Promo code" optional htmlFor="promo" error={err("promoCode")} className="lg:w-80">
          <Input id="promo" name="promoCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} className="uppercase" aria-invalid={Boolean(err("promoCode"))} />
        </Field>
        <Field label="Anything we should know?" optional htmlFor="requests" hint="Arrival time or anything we should know.">
          <Textarea id="requests" name="specialRequests" rows={3} maxLength={1000} className="min-h-20" />
        </Field>
        <section className="rounded-xl bg-[#e8eefb] px-4 py-3 text-sm text-navy-900">
          <p className="leading-relaxed whitespace-pre-line">
            <b>Cancellation: </b>
            {cancellationPolicy ?? "Please contact the hotel for cancellation terms before you book."}
          </p>
        </section>
        <div className="-mt-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-900">
            <input type="checkbox" name="acceptTerms" required className="size-5 shrink-0 accent-navy-700" aria-invalid={Boolean(err("acceptTerms"))} />
            I agree to the booking and cancellation terms
          </label>
          {err("acceptTerms") ? <p data-error className="text-sm text-danger-700">{err("acceptTerms")}</p> : null}
        </div>
        {summary ? null : <Button type="submit" size="lg" pending={pending} className="w-full sm:w-auto">Continue to payment</Button>}
      </div>
      {summary ? (
        <>
          <StayAside className="hidden lg:flex" rows={summary.rows} totalKobo={summary.totalKobo}>
            <Button type="submit" size="lg" pending={pending} className="w-full">Continue to payment</Button>
            <Link href={summary.backHref} className={buttonStyles({ variant: "ghost", size: "sm", className: "self-center" })}>← Back to rooms</Link>
            {note}
          </StayAside>
          <MobileActionBar label={summary.phoneLabel} amount={formatNaira(summary.totalKobo)}>
            <Button type="submit" size="lg" pending={pending} className="flex-1">Continue</Button>
          </MobileActionBar>
        </>
      ) : null}
    </form>
  );
}
