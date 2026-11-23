"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { addDays } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { cancelMyBooking, changeMyDates, requestGuestCode, verifyGuestCode } from "@/server/guest-account";
import type { GuestBooking } from "@/server/domain/guest-account";

export function GuestSignIn() {
  const [sent, send, sending] = useActionState(requestGuestCode, null);
  const [checked, check, checking] = useActionState(verifyGuestCode, null);
  const [again, setAgain] = useState(false);
  if (sent?.ok && !again) {
    return (
      <form action={check} className="space-y-5">
        <input type="hidden" name="email" value={sent.data.email} />
        <p className="text-sm text-ink-600">
          If <span className="text-ink-900">{sent.data.email}</span> has bookings with us, we&apos;ve emailed a 6-digit code. Check spam or Promotions if it isn&apos;t there.
        </p>
        {checked && !checked.ok ? <FormMessage>{checked.message}</FormMessage> : null}
        <Field label="Code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus className="h-12 text-center text-xl tracking-[0.5em] tabular-nums" />
        </Field>
        <Button type="submit" size="lg" pending={checking} className="w-full">Show my bookings</Button>
        <button type="button" onClick={() => setAgain(true)} className="min-h-11 text-sm text-navy-800 underline-offset-2 hover:underline">Use another email</button>
      </form>
    );
  }
  return (
    <form action={(fd) => { setAgain(false); send(fd); }} className="space-y-5">
      {sent && !sent.ok ? <FormMessage>{sent.message}</FormMessage> : null}
      <Field label="Email you booked with" htmlFor="gemail">
        <Input id="gemail" name="email" type="email" inputMode="email" autoComplete="email" required className="h-12" />
      </Field>
      <Button type="submit" size="lg" pending={sending} className="w-full">Email me a code</Button>
    </form>
  );
}

const statusText: Record<string, string> = {
  pending_payment: "Awaiting payment", confirmed: "Confirmed", checked_in: "Staying now", checked_out: "Completed", cancelled: "Cancelled",
};

function CancelBox({ b, onClose }: { b: GuestBooking; onClose: () => void }) {
  const [state, action, pending] = useActionState(cancelMyBooking, null);
  if (state?.ok) {
    return (
      <FormMessage tone="success">
        Booking cancelled.{state.data.refundKobo ? ` A refund of ${formatNaira(state.data.refundKobo)} is due; the hotel will contact you about it.` : ""}
      </FormMessage>
    );
  }
  const refund = Math.max(0, b.paidKobo - Math.min(b.paidKobo, b.feeIfCancelledKobo));
  return (
    <form action={action} className="space-y-3 rounded-md border border-danger-600/30 p-4">
      <input type="hidden" name="id" value={b.id} />
      <p className="text-[15px] text-ink-900">Cancel {b.reference}?</p>
      <p className="text-sm text-ink-600">
        {b.paidKobo === 0
          ? "Nothing has been paid, so there's no charge."
          : b.feeIfCancelledKobo
            ? `A cancellation fee of ${formatNaira(Math.min(b.paidKobo, b.feeIfCancelledKobo))} applies. Refund due: ${formatNaira(refund)}.`
            : `No fee: you're cancelling in good time. Refund due: ${formatNaira(refund)}.`}
      </p>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose}>Keep booking</Button>
        <Button type="submit" variant="danger" pending={pending}>Cancel booking</Button>
      </div>
    </form>
  );
}

function ChangeBox({ b, today, onClose }: { b: GuestBooking; today: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(changeMyDates, null);
  const [checkIn, setCheckIn] = useState(b.checkIn);
  const [checkOut, setCheckOut] = useState(b.checkOut);
  if (state?.ok) return <FormMessage tone="success">Dates changed. Any difference in price will be settled with the hotel.</FormMessage>;
  return (
    <form action={action} className="space-y-3 rounded-md border border-hairline p-4">
      <input type="hidden" name="id" value={b.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in" htmlFor={`ci-${b.id}`}>
          <Input id={`ci-${b.id}`} name="checkIn" type="date" min={addDays(today, 1)} value={checkIn} onChange={(e) => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(addDays(e.target.value, 1)); }} required />
        </Field>
        <Field label="Check-out" htmlFor={`co-${b.id}`}>
          <Input id={`co-${b.id}`} name="checkOut" type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </Field>
      </div>
      <p className="text-xs text-ink-500">Same room type, if it&apos;s free for the new dates. The price follows the new number of nights.</p>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button type="submit" pending={pending}>Change dates</Button>
      </div>
    </form>
  );
}

function BookingCard({ b, today }: { b: GuestBooking; today: string }) {
  const [open, setOpen] = useState<"cancel" | "change" | null>(null);
  return (
    <li className={cn("rounded-card border border-hairline bg-ivory-50 p-5", b.status === "cancelled" && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl text-navy-950">{b.category}</p>
          <p className="mt-1 text-sm text-ink-600 tabular-nums">
            {formatDate(b.checkIn, { year: false })} → {formatDate(b.checkOut, { year: false })} · {plural(b.nights, "night")} · {plural(b.guests, "guest")}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-500">{b.reference}</p>
        </div>
        <span className="shrink-0 rounded-full border border-hairline px-2.5 py-0.5 text-xs text-ink-700">{statusText[b.status] ?? b.status}</span>
      </div>
      <p className="mt-3 text-sm text-ink-700 tabular-nums">
        Total {formatNaira(b.dueKobo)} · Paid {formatNaira(b.paidKobo)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {b.status === "pending_payment" ? <Link href={`/book/review/${b.token}`} className={buttonStyles({ size: "sm", className: "h-11" })}>Pay now</Link> : null}
        {b.status !== "pending_payment" && b.status !== "cancelled" ? <Link href={`/book/confirmation/${b.token}`} className={buttonStyles({ size: "sm", variant: "secondary", className: "h-11" })}>View booking</Link> : null}
        {b.canChange && !open ? <Button size="sm" variant="secondary" className="h-11" onClick={() => setOpen("change")}>Change dates</Button> : null}
        {b.canCancel && !open ? <Button size="sm" variant="ghost" className="h-11" onClick={() => setOpen("cancel")}>Cancel</Button> : null}
      </div>
      {open === "cancel" ? <div className="mt-4"><CancelBox b={b} onClose={() => setOpen(null)} /></div> : null}
      {open === "change" ? <div className="mt-4"><ChangeBox b={b} today={today} onClose={() => setOpen(null)} /></div> : null}
    </li>
  );
}

export function MyBookings({ bookings, today }: { bookings: GuestBooking[]; today: string }) {
  if (!bookings.length) return <p className="text-ink-600">No bookings for this email yet.</p>;
  return <ul className="space-y-4">{bookings.map((b) => <BookingCard key={b.id} b={b} today={today} />)}</ul>;
}
