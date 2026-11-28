"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Photo } from "@/components/public/photo";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Tabs } from "@/components/ui/choice";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { formatNaira, plural } from "@/lib/format";
import { addDays } from "@/lib/hotel-date";
import { cn } from "@/lib/utils/cn";
import { cancelMyBooking, changeMyDates, requestGuestCode, verifyGuestCode } from "@/server/guest-account";
import type { GuestBooking } from "@/server/domain/guest-account";
import { stayDates } from "./booking-ui";

/** Sign in with a code sent to the email the guest booked with (design M11). */
export function GuestSignIn() {
  const [sent, send, sending] = useActionState(requestGuestCode, null);
  const [checked, check, checking] = useActionState(verifyGuestCode, null);
  const [again, setAgain] = useState(false);
  if (sent?.ok && !again) {
    return (
      <form action={check} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={sent.data.email} />
        <p className="text-[15px] text-muted">
          If <span className="text-ink-900">{sent.data.email}</span> has bookings with us, we&apos;ve emailed a 6-digit code. Check spam or Promotions if it isn&apos;t there.
        </p>
        {checked && !checked.ok ? <FormMessage>{checked.message}</FormMessage> : null}
        <Field label="Code" htmlFor="code" className="w-48">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus className="text-center text-xl tracking-[0.5em] tabular-nums" />
        </Field>
        <Button type="submit" size="lg" pending={checking} className="w-full">Show my bookings</Button>
        <button type="button" onClick={() => setAgain(true)} className="mx-auto min-h-11 text-sm font-semibold text-navy-700 underline-offset-2 hover:underline">Use another email</button>
      </form>
    );
  }
  return (
    <form action={(fd) => { setAgain(false); send(fd); }} className="flex flex-col gap-4">
      {sent && !sent.ok ? <FormMessage>{sent.message}</FormMessage> : null}
      <Field label="Email you booked with" htmlFor="gemail">
        <Input id="gemail" name="email" type="email" inputMode="email" autoComplete="email" required />
      </Field>
      <Button type="submit" size="lg" pending={sending} className="w-full">Email me a code</Button>
      <p className="text-center text-[13px] text-muted">Booked by phone or WhatsApp? Ask the front desk to add your email.</p>
    </form>
  );
}

const heldUntil = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(new Date(iso));

function status(b: GuestBooking): { tone: Tone; text: string } {
  switch (b.status) {
    case "pending_payment":
      return { tone: "warning", text: b.holdExpiresAt && Date.parse(b.holdExpiresAt) > Date.now() ? `Awaiting payment · held until ${heldUntil(b.holdExpiresAt)}` : "Awaiting payment" };
    case "confirmed":
      return b.paidKobo >= b.dueKobo ? { tone: "success", text: "Paid" } : { tone: "warning", text: `Confirmed · owes ${formatNaira(b.dueKobo - b.paidKobo)}` };
    case "checked_in":
      return { tone: "info", text: "Staying now" };
    case "checked_out":
      return { tone: "neutral", text: "Completed" };
    case "cancelled":
      return { tone: "neutral", text: "Cancelled" };
    default:
      return { tone: "neutral", text: b.status };
  }
}

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
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-[#f1b8b8] p-4">
      <input type="hidden" name="id" value={b.id} />
      <p className="text-[15px] font-semibold text-ink-900">Cancel {b.reference}?</p>
      <p className="text-sm text-muted">
        {b.paidKobo === 0
          ? "Nothing has been paid, so there's no charge."
          : b.feeIfCancelledKobo
            ? `A cancellation fee of ${formatNaira(Math.min(b.paidKobo, b.feeIfCancelledKobo))} applies. Refund due: ${formatNaira(refund)}.`
            : `No fee: you're cancelling in good time. Refund due: ${formatNaira(refund)}.`}
      </p>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="flex flex-wrap gap-2.5">
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
  if (state?.ok) return <FormMessage tone="success">Your new dates are confirmed.</FormMessage>;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-hairline p-4">
      <input type="hidden" name="id" value={b.id} />
      <div className="flex flex-wrap gap-3">
        <Field label="Arrive" htmlFor={`ci-${b.id}`} className="w-44">
          <Input id={`ci-${b.id}`} name="checkIn" type="date" min={addDays(today, 1)} value={checkIn} onChange={(e) => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(addDays(e.target.value, 1)); }} required />
        </Field>
        <Field label="Leave" htmlFor={`co-${b.id}`} className="w-44">
          <Input id={`co-${b.id}`} name="checkOut" type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </Field>
      </div>
      <p className="text-[13px] text-muted">Same room type, if it&apos;s free for the new dates. The price follows the new number of nights.</p>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button type="submit" pending={pending}>Change dates</Button>
      </div>
    </form>
  );
}

type Photos = Record<string, { image: string; alt: string } | undefined>;

/** One booking (designs G9, M10): photo, reference, room and guests, dates, status, then what the guest can do. */
function BookingCard({ b, today, photo }: { b: GuestBooking; today: string; photo?: { image: string; alt: string } }) {
  const [open, setOpen] = useState<"cancel" | "change" | null>(null);
  const s = status(b);
  const owes = b.dueKobo - b.paidKobo;
  const action = "max-lg:flex-1 lg:w-full";
  return (
    <li className={cn("overflow-hidden rounded-[14px] border border-hairline bg-white", b.status === "cancelled" && "opacity-70")}>
      <div className="grid lg:grid-cols-[160px_1fr_170px] lg:items-center lg:gap-5 lg:p-4">
        <Photo photo={photo ?? { alt: b.category }} className="h-[120px] lg:h-[100px] lg:rounded-[10px]" sizes="(min-width: 1024px) 160px, 100vw" />
        <div className="flex flex-col items-start gap-1.5 px-3.5 pt-3.5 lg:p-0">
          <span className="text-[13px] text-muted">{b.reference}</span>
          <h2 className="font-display text-[26px] leading-tight font-semibold text-ink-900">{b.category} · {plural(b.guests, "guest")}</h2>
          <span className="text-sm tabular-nums">{stayDates(b.checkIn, b.checkOut)} · {plural(b.nights, "night")}</span>
          <Badge tone={s.tone}>{s.text}</Badge>
        </div>
        <div className="flex flex-wrap gap-2.5 px-3.5 pt-3 pb-3.5 lg:flex-col lg:flex-nowrap lg:gap-2 lg:p-0">
          {b.status === "pending_payment" ? (
            <Link href={`/book/review/${b.token}`} className={buttonStyles({ size: "sm", className: cn(action, "max-lg:h-11 max-lg:basis-full") })}>Pay {formatNaira(owes)}</Link>
          ) : null}
          {b.receipt ? (
            <Link href={`/book/receipt/${b.token}/${b.receipt}`} className={buttonStyles({ variant: "secondary", size: "sm", className: action })}>
              <span className="lg:hidden">Receipt</span><span className="max-lg:hidden">View receipt</span>
            </Link>
          ) : null}
          {b.status !== "pending_payment" && b.status !== "cancelled" && !b.receipt ? (
            <Link href={`/book/confirmation/${b.token}`} className={buttonStyles({ variant: "secondary", size: "sm", className: action })}>View booking</Link>
          ) : null}
          {b.canChange && !open ? <Button size="sm" variant="secondary" className={action} onClick={() => setOpen("change")}>Change dates</Button> : null}
          {b.canCancel && !open ? (
            <Button size="sm" variant="danger" className={action} onClick={() => setOpen("cancel")}>
              <span className="lg:hidden">Cancel</span><span className="max-lg:hidden">Cancel booking</span>
            </Button>
          ) : null}
        </div>
      </div>
      {open === "cancel" ? <div className="px-3.5 pb-3.5 lg:px-4 lg:pb-4"><CancelBox b={b} onClose={() => setOpen(null)} /></div> : null}
      {open === "change" ? <div className="px-3.5 pb-3.5 lg:px-4 lg:pb-4"><ChangeBox b={b} today={today} onClose={() => setOpen(null)} /></div> : null}
    </li>
  );
}

/** Upcoming and past bookings, on two tabs (designs G9, M10). */
export function MyBookings({ bookings, today, photos = {} }: { bookings: GuestBooking[]; today: string; photos?: Photos }) {
  const upcoming = bookings.filter((b) => ["pending_payment", "confirmed", "checked_in"].includes(b.status) && b.checkOut >= today).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));
  const [tab, setTab] = useState<"upcoming" | "past">(upcoming.length || !past.length ? "upcoming" : "past");
  const shown = tab === "upcoming" ? upcoming : past;
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <Tabs
        label="Your bookings"
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: `Upcoming${upcoming.length ? ` (${upcoming.length})` : ""}` },
          { value: "past", label: `Past${past.length ? ` (${past.length})` : ""}` },
        ]}
      />
      {shown.length ? (
        <ul role="tabpanel" className="flex flex-col gap-3 lg:gap-4">
          {shown.map((b) => <BookingCard key={b.id} b={b} today={today} photo={photos[b.categorySlug]} />)}
        </ul>
      ) : (
        <p role="tabpanel" className="text-muted">{bookings.length ? (tab === "upcoming" ? "No upcoming bookings." : "No past bookings yet.") : "No bookings for this email yet."}</p>
      )}
    </div>
  );
}
