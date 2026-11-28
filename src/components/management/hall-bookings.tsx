"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Field, FormMessage, Input, MoneyInput, Select } from "@/components/ui/form";
import { formatDate, formatNaira } from "@/lib/format";
import { keepValues } from "@/lib/forms";
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
    // keepValues: an error (e.g. "The hall is already booked at that time.") keeps what was typed; success clears the form.
    <form ref={form} action={action} onSubmit={keepValues(action)}>
      <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {state?.ok ? <div className="sm:col-span-2 lg:col-span-4"><FormMessage tone="success">Saved.</FormMessage></div> : null}
        {state && !state.ok && !state.fieldErrors ? <div className="sm:col-span-2 lg:col-span-4"><FormMessage>{state.message}</FormMessage></div> : null}
        <Field label="Event" htmlFor="htitle" error={err("title")}><Input id="htitle" name="title" placeholder="Staff training" required /></Field>
        <Field label="Booked by" htmlFor="hname" error={err("customerName")}><Input id="hname" name="customerName" placeholder="Company or person" required /></Field>
        <Field label="Date" htmlFor="hdate" error={err("eventDate")}><Input id="hdate" name="eventDate" type="date" min={today} required /></Field>
        <Field label="Guests" optional htmlFor="hguests"><Input id="hguests" name="guests" type="number" min={1} placeholder="0" className="w-28" /></Field>
        <Field label="From" htmlFor="hstart" error={err("startTime")}><Input id="hstart" name="startTime" type="time" defaultValue="09:00" required className="w-36" /></Field>
        <Field label="To" htmlFor="hend" error={err("endTime")}><Input id="hend" name="endTime" type="time" defaultValue="17:00" required className="w-36" /></Field>
        <Field label="Price" optional htmlFor="hprice" error={err("price")}><MoneyInput id="hprice" name="price" type="number" min={0} step="any" placeholder="0" /></Field>
        <Field label="Phone" optional htmlFor="hphone"><Input id="hphone" name="phone" type="tel" inputMode="tel" placeholder="0803…" className="w-48" /></Field>
        <Field label="Email" optional htmlFor="hemail" error={err("email")}><Input id="hemail" name="email" type="email" /></Field>
        <Field label="Notes" optional htmlFor="hnotes" className="sm:col-span-1 lg:col-span-3"><Input id="hnotes" name="notes" placeholder="Setup, catering, projector…" /></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
        <p className="text-[13px] text-[#5b6372]">Saved as an enquiry. Confirmed once it has a price and is paid in full. Clashing times are refused.</p>
        <Button type="submit" pending={pending}>Save hall booking</Button>
      </div>
    </form>
  );
}

/** Cancelling: a plain form, submitted from the row's ⋯ menu. */
function CancelHallBooking({ id }: { id: string }) {
  const [state, action] = useActionState(changeHallStatus, null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="cancelled" />
      <Menu
        label="More actions"
        align="right"
        button={<span aria-hidden>⋯</span>}
        buttonClassName="inline-flex size-9 items-center justify-center rounded-lg border border-[#cfcabd] bg-white text-lg text-[#5b6372] hover:bg-ivory-100 pointer-coarse:size-11"
      >
        <MenuItem href={`/app/events/${id}/invoice`}>Invoice</MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={() => form.current?.requestSubmit()}>Cancel booking</MenuItem>
      </Menu>
      {state && !state.ok ? <p role="alert" className="mt-1 text-xs text-[#a61b1b]">{state.message}</p> : null}
    </form>
  );
}

function PaymentForm({ b, today, onDone }: { b: HallBooking; today: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addHallPayment, null);
  const [paymentId] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("bank_transfer");
  const transfer = method === "bank_transfer";
  const pos = method === "pos_terminal";
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline bg-ivory-50 p-3">
      <input type="hidden" name="bookingId" value={b.id} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <Field label="Amount" htmlFor={`pa-${b.id}`}><MoneyInput id={`pa-${b.id}`} name="amount" type="number" min={1} step="any" defaultValue={b.price_kobo > b.paid_kobo ? (b.price_kobo - b.paid_kobo) / 100 : undefined} className="w-40" required /></Field>
      <Field label="Method" htmlFor={`pm-${b.id}`}>
        <Select id={`pm-${b.id}`} name="method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-11">
          <option value="bank_transfer">Transfer</option><option value="cash">Cash</option><option value="pos_terminal">POS</option><option value="card">Card</option>
        </Select>
      </Field>
      <Field label="Date" htmlFor={`pd-${b.id}`}><Input id={`pd-${b.id}`} name="paidOn" type="date" max={today} defaultValue={today} className="h-11" /></Field>
      <Field label={transfer ? "Transfer reference or sender" : pos ? "POS slip, last 4" : "Reference"} optional={!transfer && !pos} htmlFor={`pr-${b.id}`}>
        <Input id={`pr-${b.id}`} name="reference" className="h-11 w-44" required={transfer || pos} minLength={transfer ? 3 : pos ? 4 : undefined} maxLength={pos ? 4 : undefined} inputMode={pos ? "numeric" : undefined} pattern={pos ? "[0-9]{4}" : undefined} />
      </Field>
      <Button type="submit" pending={pending}>Record payment</Button>
      {state && !state.ok ? <p className="w-full text-xs text-danger-700">{state.message}</p> : null}
    </form>
  );
}

/** Design R109: Paid, Owes ₦X, Awaiting payment (a price, nothing paid), Enquiry (no price yet), Cancelled. */
function HallStatus({ b }: { b: HallBooking }) {
  if (b.status === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  if (b.status === "confirmed") return <Badge tone="success">Paid</Badge>;
  if (b.price_kobo > 0 && b.paid_kobo > 0) return <Badge tone="warning">Owes {formatNaira(b.price_kobo - b.paid_kobo)}</Badge>;
  if (b.price_kobo > 0) return <Badge tone="warning">Awaiting payment</Badge>;
  return <Badge tone="neutral">Enquiry</Badge>;
}

const td = "px-4 py-2.5 align-middle text-sm text-ink-900";
const th = "px-4 py-2.5 text-xs font-semibold text-[#5b6372] whitespace-nowrap";

function Row({ b, today }: { b: HallBooking; today: string }) {
  const [paying, setPaying] = useState(false);
  const owing = b.status !== "cancelled" && b.price_kobo > 0 && b.paid_kobo < b.price_kobo;
  return (
    <>
      <tr className={cn("border-b border-[#f1eee8]", b.status === "cancelled" && "opacity-55")}>
        <td className={cn(td, "whitespace-nowrap")}>{b.event_date === today ? "Today" : formatDate(b.event_date, { year: today.slice(0, 4) })} · {b.start_time}–{b.end_time}</td>
        <td className={td}>
          {b.title}{b.guests ? ` · ${b.guests} guests` : ""}
          {b.notes ? <span className="block text-xs text-[#5b6372]">{b.notes}</span> : null}
        </td>
        <td className={td}>
          {b.customer_name}
          {b.phone || b.email ? <span className="block text-xs text-[#5b6372]">{[b.phone, b.email].filter(Boolean).join(" · ")}</span> : null}
        </td>
        <td className={cn(td, "text-right whitespace-nowrap")}>
          <span className="font-semibold">{b.price_kobo ? formatNaira(b.price_kobo) : "—"}</span>
          {b.paid_kobo && b.paid_kobo < b.price_kobo ? <span className="block text-xs text-[#5b6372]">{formatNaira(b.paid_kobo)} paid</span> : !b.price_kobo && b.paid_kobo ? <span className="block text-xs text-[#5b6372]">{formatNaira(b.paid_kobo)} paid</span> : null}
        </td>
        <td className={td}><HallStatus b={b} /></td>
        <td className="w-px px-4 py-1.5 text-right whitespace-nowrap">
          {b.status !== "cancelled" ? (
            <span className="inline-flex items-center gap-2">
              {owing && !paying ? <Button size="sm" onClick={() => setPaying(true)}>Take payment</Button> : null}
              {!owing ? <a href={`/app/events/${b.id}/invoice`} className={buttonStyles({ variant: "secondary", size: "sm" })}>Open</a> : null}
              <CancelHallBooking id={b.id} />
            </span>
          ) : null}
        </td>
      </tr>
      {paying ? (
        <tr className="border-b border-[#f1eee8]">
          <td colSpan={6} className="px-4 pb-3">
            <PaymentForm b={b} today={today} onDone={() => setPaying(false)} />
            <button type="button" onClick={() => setPaying(false)} className="mt-1 text-sm font-semibold text-navy-700 hover:underline">Close</button>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function HallBookingList({ bookings, today }: { bookings: HallBooking[]; today: string }) {
  if (!bookings.length) return <p className="px-4 py-6 text-sm text-[#5b6372]">No hall bookings yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-left tabular-nums">
        <thead className="border-b border-hairline">
          <tr>
            <th scope="col" className={th}>When</th>
            <th scope="col" className={th}>Event</th>
            <th scope="col" className={th}>Booked by</th>
            <th scope="col" className={cn(th, "text-right")}>Price</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>{bookings.map((b) => <Row key={b.id} b={b} today={today} />)}</tbody>
      </table>
    </div>
  );
}
