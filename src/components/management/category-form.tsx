"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { saveCategory } from "@/server/rooms";
import { keepValues } from "@/lib/forms";
import { MIN_NIGHTLY_RATE_KOBO } from "@/domain/pricing";
import { formatNaira } from "@/lib/format";

export type CategoryFormValues = {
  id?: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  amenities: string[];
  nightlyRateKobo?: number;
  maxOccupancy?: number;
  sortOrder: number;
  isActive: boolean;
};

export function CategoryForm({ category, action = saveCategory }: { category?: CategoryFormValues; action?: (p: ActionResult | null, f: FormData) => Promise<ActionResult> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="grid gap-6 px-4 py-6 lg:grid-cols-[2fr_1fr] lg:px-8">
      {category?.id ? <input type="hidden" name="id" value={category.id} /> : null}
      <div className="space-y-6">
        {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
        <Card>
          <CardHeader title="Details" description="Shown to guests on the website." />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="cname" required error={err("name")}><Input id="cname" name="name" defaultValue={category?.name} required /></Field>
            <Field label="Web address" htmlFor="cslug" hint="e.g. deluxe" error={err("slug")}><Input id="cslug" name="slug" defaultValue={category?.slug} required /></Field>
            <Field label="Short description" htmlFor="cshort" className="sm:col-span-2" error={err("shortDescription")}>
              <Input id="cshort" name="shortDescription" defaultValue={category?.shortDescription} maxLength={200} />
            </Field>
            <Field label="Full description" htmlFor="cdesc" className="sm:col-span-2" error={err("description")}>
              <Textarea id="cdesc" name="description" rows={5} defaultValue={category?.description} maxLength={4000} />
            </Field>
            <Field label="Amenities" htmlFor="camen" hint="One per line, e.g. King bed. Only list what the room really has." className="sm:col-span-2">
              <Textarea id="camen" name="amenities" rows={4} defaultValue={category?.amenities.join("\n")} />
            </Field>
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Pricing & capacity" />
          <div className="space-y-5 p-5">
            <Field label="Nightly rate (₦)" htmlFor="crate" required hint={`At least ${formatNaira(MIN_NIGHTLY_RATE_KOBO)}. Applies to new bookings only; existing bookings keep their price.`} error={err("nightlyRate")}>
              <Input id="crate" name="nightlyRate" inputMode="decimal" min={MIN_NIGHTLY_RATE_KOBO / 100} defaultValue={category?.nightlyRateKobo ? String(category.nightlyRateKobo / 100) : ""} required />
            </Field>
            <Field label="Maximum guests" htmlFor="cocc" required error={err("maxOccupancy")}>
              <Input id="cocc" name="maxOccupancy" type="number" min={1} max={20} defaultValue={category?.maxOccupancy ?? 2} required />
            </Field>
            <Field label="Display order" htmlFor="csort" hint="Lower numbers appear first.">
              <Input id="csort" name="sortOrder" type="number" min={0} max={1000} defaultValue={category?.sortOrder ?? 0} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-md bg-ivory-100 p-3 text-sm">
              <span><span className="font-medium text-ink-900">Bookable online</span><br /><span className="text-ink-500">Untick to hide it from the website.</span></span>
              <input type="checkbox" name="isActive" defaultChecked={category?.isActive ?? true} className="size-5 accent-navy-800" />
            </label>
          </div>
        </Card>
        {!category?.id ? (
          <Card>
            <CardHeader title="Photos" />
            <p className="p-5 text-sm text-ink-500">Save the category first, then add its photos.</p>
          </Card>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="submit" pending={pending}>Save category</Button>
        </div>
      </div>
    </form>
  );
}
