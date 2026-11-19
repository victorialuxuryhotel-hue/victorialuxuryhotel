"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { bookingSource } from "@/domain/status";
import type { CategoryRow } from "@/domain/views";
import { formatNaira, nightsBetween, plural } from "@/lib/format";
import { createReservation } from "@/server/reservations";
import { keepValues } from "@/lib/forms";

/**
 * Direct booking (walk-in, phone, WhatsApp). Submits to the same reservation
 * engine as the website: the database re-checks availability and computes the
 * price. The summary here is only a preview.
 */
export function ReservationForm({ categories, today, holdHours }: { categories: CategoryRow[]; today: string; holdHours: number }) {
  const [state, action, pending] = useActionState(createReservation, null);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState("");
  const [categoryId, setCategoryId] = useState(categories.find((c) => c.isActive)?.id ?? "");
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);

  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  const cat = categories.find((c) => c.id === categoryId);

  return (
    <form action={action} onSubmit={keepValues(action)} className="grid gap-6 px-4 py-6 lg:px-8 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        {state && !state.ok && !state.fieldErrors ? <FormMessage>{state.message}</FormMessage> : null}
        <Card>
          <CardHeader title="Stay" />
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Check-in" htmlFor="nci" required error={err("checkIn")}>
              <Input id="nci" name="checkIn" type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
            </Field>
            <Field label="Check-out" htmlFor="nco" required error={err("checkOut")}>
              <Input id="nco" name="checkOut" type="date" min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
            </Field>
            <Field label="Guests" htmlFor="ng" required error={err("guests")}>
              <Input id="ng" name="guests" type="number" min={1} max={cat?.maxOccupancy ?? 20} defaultValue={1} required />
            </Field>
            <Field label="Received by" htmlFor="nsrc" required>
              <Select id="nsrc" name="source" defaultValue="walk_in">
                {(["walk_in", "phone", "whatsapp", "staff"] as const).map((s) => <option key={s} value={s}>{bookingSource[s]}</option>)}
              </Select>
            </Field>
          </div>
          <fieldset className="border-t border-ivory-200 p-5">
            <legend className="mb-3 text-sm font-medium text-ink-700">Room type</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.filter((c) => c.isActive).map((c) => (
                <label key={c.id} className="flex cursor-pointer flex-col rounded-md border border-ivory-200 p-4 has-[:checked]:border-navy-700 has-[:checked]:bg-navy-50">
                  <span className="flex items-center justify-between">
                    <span className="font-medium text-ink-900">{c.name}</span>
                    <input type="radio" name="categoryId" value={c.id} checked={categoryId === c.id} onChange={() => setCategoryId(c.id)} className="accent-navy-800" />
                  </span>
                  <span className="mt-1 text-sm tabular-nums text-ink-600">{formatNaira(c.nightlyRateKobo)} / night</span>
                  <span className="mt-0.5 text-xs text-ink-500">Sleeps {c.maxOccupancy}</span>
                </label>
              ))}
            </div>
            {err("categoryId") ? <p className="mt-2 text-sm text-danger-700">{err("categoryId")}</p> : null}
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Guest" description="Returning guests are matched by email automatically." />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="gn" required error={err("fullName")}><Input id="gn" name="fullName" autoComplete="off" required /></Field>
            <Field label="Phone" htmlFor="gp" required error={err("phone")}><Input id="gp" name="phone" type="tel" placeholder="+234" required /></Field>
            <Field label="Email" htmlFor="ge" hint="Needed to email a confirmation." error={err("email")}><Input id="ge" name="email" type="email" /></Field>
            <Field label="Special requests" htmlFor="gr" className="sm:col-span-2"><Textarea id="gr" name="specialRequests" rows={2} maxLength={1000} /></Field>
          </div>
        </Card>
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader title="Summary" />
          <div className="space-y-3 p-5 text-sm">
            {cat && nights > 0 ? (
              <>
                <div className="flex justify-between"><span className="text-ink-500">{formatNaira(cat.nightlyRateKobo)} × {plural(nights, "night")}</span><span className="tabular-nums">{formatNaira(cat.nightlyRateKobo * nights)}</span></div>
                <div className="flex justify-between border-t border-ivory-200 pt-3 text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatNaira(cat.nightlyRateKobo * nights)}</span></div>
                <p className="text-xs text-ink-500">Final price is confirmed by the system when you create the reservation.</p>
              </>
            ) : (
              <p className="text-ink-500">Choose dates and a room type to see the price.</p>
            )}
          </div>
          <div className="space-y-3 border-t border-ivory-200 p-5">
            <p className="text-sm text-ink-600">
              The room is held for {plural(holdHours, "hour")} while awaiting payment. Record the payment on the next screen to confirm it.
            </p>
            <Button type="submit" size="lg" pending={pending} className="w-full">Create reservation</Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
