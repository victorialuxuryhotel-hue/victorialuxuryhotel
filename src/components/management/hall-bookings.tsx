"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { addHallBooking, addHallPayment, changeHallStatus } from "@/server/events";
import type { HallBooking } from "@/server/domain/events";

export function HallBookingForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addHallBooking, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const err = (n: string) => (state && !state.ok ? state.fieldErrors?.[n]?.[0] : undefined);
  return (
    <form ref={form} action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      {state?.ok ? <div className="sm:col-span-2 lg:col-span-4"><FormMessage tone="success">Saved.</FormMessage></div> : null}
      {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-2 lg:col-span-4"><FormMessage>{state.message}</FormMessage></div> : null}
      <Field label="Event" htmlFor="htitle" error={err("title")} className="sm:col-span-2"><Input id="htitle" name="title" placeholder="Staff training" required /></Field>
      <Field label="Booked by" htmlFor="hname" error={err("customerName")} className="sm:col-span-2"><Input id="hname" name="customerName" placeholder="Company or person" required /></Field>
      <Field label="Phone" optional htmlFor="hphone"><Input id="hphone" name="phone" type="tel" inputMode="tel" /></Field>
      <Field label="Email" optional htmlFor="hemail" error={err("email")}><Input id="hemail" name="email" type="email" /></Field>
      <Field label="Date" htmlFor="hdate" error={err("eventDate")}><Input id="hdate" name="eventDate" type="date" min={today} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="hstart" error={err("startTime")}><Input id="hstart" name="startTime" type="time" defaultValue="09:00" required /></Field>
        <Field label="To" htmlFor="hend" error={err("endTime")}><Input id="hend" name="endTime" type="time" defaultValue="17:00" required /></Field>
      </div>
      <Field label="Guests" optional htmlFor="hguests"><Input id="hguests" name="guests" type="number" min={1} /></Field>
      <Field label="Price (₦)" optional htmlFor="hprice" error={err("price")}><Input id="hprice" name="price" type="number" min={0} step="any" inputMode="decimal" /></Field>
      <Field label="Status" htmlFor="hstatus">
        <Select id="hstatus" name="status" defaultValue="enquiry"><option value="enquiry">Enquiry</option><option value="confirmed">Confirmed</option></Select>
      </Field>
      <Field label="Notes" optional htmlFor="hnotes" className="sm:col-span-2 lg:col-span-4"><Textarea id="hnotes" name="notes" rows={2} placeholder="Setup, catering, projector…" /></Field>
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" pending={pending}>Save hall booking</Button></div>
    </form>
  );
}

function StatusButton({ id, status, label, variant }: { id: string; status: "confirmed" | "cancelled"; label: string; variant: "secondary" | "ghost" }) {
  const [state, action, pending] = useActionState(changeHallStatus, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} className="h-11" pending={pending}>{label}</Button>
      {state && !state.ok ? <p className="mt-1 text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

function PaymentForm({ b, today, onDone }: { b: HallBooking; today: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addHallPayment, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-hairline p-3">
      <input type="hidden" name="bookingId" value={b.id} />
      <Field label="Amount (₦)" htmlFor={`pa-${b.id}`}><Input id={`pa-${b.id}`} name="amount" type="number" min={1} step="any" defaultValue={b.price_kobo > b.paid_kobo ? (b.price_kobo - b.paid_kobo) / 100 : undefined} className="h-11 w-32" required /></Field>
      <Field label="Method" htmlFor={`pm-${b.id}`}>
        <Select id={`pm-${b.id}`} name="method" defaultValue="bank_transfer" className="h-11">
          <option value="bank_transfer">Transfer</option><option value="cash">Cash</option><option value="pos_terminal">POS</option><option value="card">Card</option>
        </Select>
      </Field>
      <Field label="Date" htmlFor={`pd-${b.id}`}><Input id={`pd-${b.id}`} name="paidOn" type="date" max={today} defaultValue={today} className="h-11" /></Field>
      <Field label="Reference" optional htmlFor={`pr-${b.id}`}><Input id={`pr-${b.id}`} name="reference" className="h-11 w-36" /></Field>
      <Button type="submit" size="sm" className="h-11" pending={pending}>Record</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

const statusText = { enquiry: "Enquiry", confirmed: "Confirmed", cancelled: "Cancelled" } as const;

function Row({ b, today }: { b: HallBooking; today: string }) {
  const [paying, setPaying] = useState(false);
  return (
    <li className={cn("px-5 py-4", b.status === "cancelled" && "opacity-55")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-ink-900">{b.title}</p>
          <p className="text-sm text-ink-600 tabular-nums">{b.start_time}–{b.end_time} · {b.customer_name}{b.guests ? ` · ${b.guests} guests` : ""}</p>
          {b.phone || b.email ? <p className="text-xs text-ink-500">{[b.phone, b.email].filter(Boolean).join(" · ")}</p> : null}
          {b.notes ? <p className="mt-1 text-xs text-ink-500">{b.notes}</p> : null}
        </div>
        <div className="text-right">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", b.status === "confirmed" ? "border-navy-800 text-navy-800" : "border-hairline text-ink-700")}>{statusText[b.status]}</span>
          <p className="mt-1 text-sm tabular-nums text-ink-700">{b.price_kobo ? `${formatNaira(b.paid_kobo)} of ${formatNaira(b.price_kobo)}` : b.paid_kobo ? `${formatNaira(b.paid_kobo)} paid` : "No price set"}</p>
        </div>
      </div>
      {b.status !== "cancelled" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {b.status === "enquiry" ? <StatusButton id={b.id} status="confirmed" label="Confirm" variant="secondary" /> : null}
          {!paying && (!b.price_kobo || b.paid_kobo < b.price_kobo) ? <Button size="sm" variant="secondary" className="h-11" onClick={() => setPaying(true)}>Record payment</Button> : null}
          <StatusButton id={b.id} status="cancelled" label="Cancel" variant="ghost" />
        </div>
      ) : null}
      {paying ? <PaymentForm b={b} today={today} onDone={() => setPaying(false)} /> : null}
    </li>
  );
}

export function HallBookingList({ bookings, today }: { bookings: HallBooking[]; today: string }) {
  if (!bookings.length) return <p className="px-5 py-6 text-sm text-ink-500">No hall bookings yet.</p>;
  const days: Array<{ day: string; items: HallBooking[] }> = [];
  for (const b of bookings) {
    const last = days.at(-1);
    if (last?.day === b.event_date) last.items.push(b);
    else days.push({ day: b.event_date, items: [b] });
  }
  return (
    <div>
      {days.map((d) => (
        <section key={d.day}>
          <h3 className="border-y border-hairline bg-ivory-100 px-5 py-2 font-sans text-xs tracking-[0.2em] text-ink-500 uppercase">{d.day === today ? "Today" : formatDate(d.day, { weekday: true })}</h3>
          <ul className="divide-y divide-hairline">{d.items.map((b) => <Row key={b.id} b={b} today={today} />)}</ul>
        </section>
      ))}
    </div>
  );
}
