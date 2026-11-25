"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, Wallet, XCircle } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { applyChangeUnpaid, assignRoom, cancelPendingChange, cancelReservation, changeDates, checkIn, checkOut, markNoShow, overridePayment, resolveAttention, updateReservationDetails } from "@/server/reservations";
import { ActionButton } from "./action-form";
import { useActionFeedback, withFeedback } from "./action-feedback";
import { keepValues } from "@/lib/forms";
import { OFFLINE_REASON, useOnline } from "./connection";

/** blocked: why this room can't be chosen now ("Occupied · Adeyemi", "To clean", "Out of order"). */
export type RoomOption = { id: string; number: string; category: string; ready: boolean; blocked?: string };

type Size = "sm" | "md" | "lg";

/** Shown instead of check-in or check-out while money is owed: the server refuses both until the balance is paid. */
export function TakePaymentLink({ reservationId, balanceKobo, size = "md" }: { reservationId: string; balanceKobo: number; size?: Size }) {
  const online = useOnline();
  const style = buttonStyles({ size, variant: size === "sm" ? "secondary" : "primary", className: size === "lg" ? "w-full" : "whitespace-nowrap" });
  if (!online) {
    return (
      <span role="link" aria-disabled="true" title={OFFLINE_REASON} className={`${style} cursor-not-allowed opacity-45`}>
        <Wallet className="size-4" aria-hidden /> Take payment · {formatNaira(balanceKobo)}
      </span>
    );
  }
  return (
    <Link
      href={`/app/payments/record?reservation=${reservationId}`}
      className={buttonStyles({ size, variant: size === "sm" ? "secondary" : "primary", className: size === "lg" ? "w-full" : "whitespace-nowrap" })}
    >
      <Wallet className="size-4" aria-hidden /> Take payment · {formatNaira(balanceKobo)}
    </Link>
  );
}

export function CheckInButton({ reservationId, roomNumber, disabledReason, balanceKobo = 0, size }: { reservationId: string; roomNumber?: string; disabledReason?: string; balanceKobo?: number; size?: Size }) {
  const feedback = useActionFeedback();
  const online = useOnline();
  if (balanceKobo > 0) return <TakePaymentLink reservationId={reservationId} balanceKobo={balanceKobo} size={size} />;
  if (!online) disabledReason = OFFLINE_REASON;
  if (disabledReason) {
    return (
      <Button disabled title={disabledReason}>
        <LogIn className="size-4" aria-hidden /> Check in
      </Button>
    );
  }
  return (
    <ActionButton
      action={checkIn}
      fields={{ reservationId }}
      onSuccess={(d) => feedback({
        message: roomNumber ? `Checked in to Room ${roomNumber}. Hand over the key.` : "Checked in.",
        undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined,
      })}
    >
      <LogIn className="size-4" aria-hidden /> Check in
    </ActionButton>
  );
}

export function CheckOutButton({ reservationId, balanceKobo, size }: { reservationId: string; balanceKobo: number; size?: Size }) {
  const feedback = useActionFeedback();
  const online = useOnline();
  if (balanceKobo > 0) return <TakePaymentLink reservationId={reservationId} balanceKobo={balanceKobo} size={size} />;
  if (!online) {
    return (
      <Button disabled title={OFFLINE_REASON} size={size === "lg" ? "md" : size} variant={size === "sm" ? "secondary" : "primary"}>
        <LogOut className="size-4" aria-hidden /> Check out
      </Button>
    );
  }
  return (
    <ActionButton
      action={checkOut}
      fields={{ reservationId }}
      size={size === "lg" ? "md" : size}
      variant={size === "sm" ? "secondary" : "primary"}
      onSuccess={(d) => feedback({
        message: "Checked out. The room is marked for cleaning.",
        undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined,
      })}
    >
      <LogOut className="size-4" aria-hidden /> Check out
    </ActionButton>
  );
}

export function NoShowButton({ reservationId, size }: { reservationId: string; size?: Size }) {
  const feedback = useActionFeedback();
  return (
    <ActionButton
      action={markNoShow}
      fields={{ reservationId }}
      variant={size === "sm" ? "secondary" : "ghost"}
      size={size === "lg" ? "md" : size}
      confirm="Mark this guest as a no-show? The room is released for tonight."
      onSuccess={(d) => feedback({ message: "Marked as a no-show. The room is released.", undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined })}
    >
      {size === "sm" ? "Mark no-show" : "No-show"}
    </ActionButton>
  );
}

export function AssignRoomForm({
  reservationId,
  current,
  rooms,
  booked,
  specialRequests,
}: {
  reservationId: string;
  current?: string;
  rooms: RoomOption[];
  booked: string;
  specialRequests?: string;
}) {
  const feedback = useActionFeedback();
  const [chosen, setChosen] = useState("");
  const [state, action, pending] = useActionState(
    withFeedback(assignRoom, (d) => {
      const number = rooms.find((r) => r.id === chosen)?.number;
      feedback({
        message: d.pendingChangeId
          ? `Room ${number ?? ""} costs ${formatNaira(d.chargeKobo)} more. Take the payment and the guest moves straight away.`
          : number ? `${current ? "Moved to" : "Assigned"} Room ${number}.` : "Room updated.",
        undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined,
      });
    }),
    null,
  );
  const sameCategory = rooms.filter((r) => r.category === booked);
  const others = rooms.filter((r) => r.category !== booked);
  const label = (r: RoomOption) => `Room ${r.number}${r.blocked ? ` · ${r.blocked}` : ""}`;
  const option = (r: RoomOption, withType = false) => (
    <option key={r.id} value={r.id} disabled={Boolean(r.blocked) || r.number === current}>
      {label(r)}{withType ? ` · ${r.category}` : ""}{r.number === current ? " (current)" : ""}
    </option>
  );
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3 border-t border-hairline bg-ivory-50 px-5 py-4">
      <input type="hidden" name="reservationId" value={reservationId} />
      {specialRequests ? (
        <div className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-ink-500">Special requests</p>
          <p className="mt-0.5 text-ink-800">{specialRequests}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={current ? `Change room (now ${current})` : "Assign a room"} htmlFor="room" className="flex-1">
          <Select id="room" name="roomId" value={chosen} onChange={(e) => setChosen(e.target.value)} required>
            <option value="" disabled>
              {rooms.some((r) => !r.blocked) ? "Choose a room" : "No free rooms for these dates"}
            </option>
            {sameCategory.length ? (
              <optgroup label={booked}>{sameCategory.map((r) => option(r))}</optgroup>
            ) : null}
            {others.length ? (
              <optgroup label="Other room types (upgrade or move)">
                {others.map((r) => option(r, true))}
              </optgroup>
            ) : null}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" pending={pending}>{current ? "Change" : "Assign"}</Button>
      </div>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
    </form>
  );
}

export function CancelForm({ reservationId }: { reservationId: string }) {
  const [state, action, pending] = useActionState(cancelReservation, null);
  return (
    <details className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-md px-4 text-sm font-medium text-danger-700 hover:bg-danger-50">
        <XCircle className="size-4" aria-hidden /> Cancel
      </summary>
      <form action={action} onSubmit={keepValues(action)} className="absolute right-0 z-20 mt-2 w-80 space-y-3 rounded-card border border-hairline bg-ivory-50 p-4 shadow-lg">
        <input type="hidden" name="reservationId" value={reservationId} />
        <Field label="Reason for cancelling" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" name="reason" rows={2} required minLength={3} />
        </Field>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        <p className="text-xs text-ink-500">Any refund is handled separately, according to the hotel&apos;s cancellation policy.</p>
        <Button type="submit" variant="danger" pending={pending} className="w-full">Cancel booking</Button>
      </form>
    </details>
  );
}

export function OverrideForm({ reservationId }: { reservationId: string }) {
  const [state, action, pending] = useActionState(overridePayment, null);
  return (
    <details className="mt-6 rounded-card border border-hairline bg-ivory-50 p-4 text-sm">
      <summary className="cursor-pointer font-medium text-ink-900">Manager option: hold the room longer</summary>
      <form action={action} onSubmit={keepValues(action)} className="mt-4 space-y-3">
        <input type="hidden" name="reservationId" value={reservationId} />
        <Field label="Reason" htmlFor="override-reason">
          <Input id="override-reason" name="reason" required minLength={5} placeholder="e.g. Guest is sending the transfer tomorrow" />
        </Field>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        {state?.ok ? <FormMessage tone="success">Done. The room is held 24 hours more.</FormMessage> : null}
        <p className="text-xs text-ink-500">The booking is confirmed only when it is paid in full.</p>
        <Button type="submit" name="action" value="extend" variant="secondary" pending={pending}>Hold 24 hours more</Button>
      </form>
    </details>
  );
}

export function DetailsForm({ reservationId, guests, specialRequests, maxGuests }: { reservationId: string; guests: number; specialRequests?: string; maxGuests: number }) {
  const [state, action, pending] = useActionState(updateReservationDetails, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-3 border-t border-hairline px-5 py-4">
      <input type="hidden" name="reservationId" value={reservationId} />
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <Field label="Guests" htmlFor="d-guests"><Stepper id="d-guests" name="guests" max={maxGuests} defaultValue={guests} unit={["guest", "guests"]} /></Field>
        <Field label="Special requests" optional htmlFor="d-req"><Input id="d-req" name="specialRequests" defaultValue={specialRequests} maxLength={1000} /></Field>
      </div>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Saved.</FormMessage> : null}
      <Button type="submit" size="sm" variant="secondary" pending={pending}>Save details</Button>
    </form>
  );
}

export function ChangeDatesForm({ reservationId, checkIn: ci, checkOut: co, inHouse }: { reservationId: string; checkIn: string; checkOut: string; inHouse: boolean }) {
  const [state, action, pending] = useActionState(changeDates, null);
  return (
    <details className="border-t border-hairline px-5 py-4 text-sm">
      <summary className="cursor-pointer font-medium text-navy-800">{inHouse ? "Extend or shorten the stay" : "Change dates"}</summary>
      <form action={action} onSubmit={keepValues(action)} className="mt-3 space-y-3">
        <input type="hidden" name="reservationId" value={reservationId} />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Check-in" htmlFor="cd-in">
            <Input id="cd-in" name="checkIn" type="date" defaultValue={ci} readOnly={inHouse} className={inHouse ? "bg-ivory-100" : undefined} />
          </Field>
          <Field label="Check-out" htmlFor="cd-out"><Input id="cd-out" name="checkOut" type="date" defaultValue={co} /></Field>
          <Button type="submit" size="md" variant="secondary" pending={pending}>Update dates</Button>
        </div>
        <p className="text-xs text-ink-500">Availability is re-checked and the total re-priced at the rate agreed at booking.</p>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        {state?.ok ? (
          <FormMessage tone="success">
            {state.data?.pendingChangeId ? `These dates cost ${formatNaira(state.data.chargeKobo)} more. Take the payment and they apply straight away.` : "Dates updated."}
          </FormMessage>
        ) : null}
      </form>
    </details>
  );
}

export function ResolveAttentionForm({ reservationId }: { reservationId: string }) {
  const [state, action, pending] = useActionState(resolveAttention, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="reservationId" value={reservationId} />
      <label className="sr-only" htmlFor="resolve-note">How was this resolved?</label>
      <Input id="resolve-note" name="note" required minLength={5} placeholder="How was this resolved? (recorded)" className="flex-1 bg-ivory-50" />
      <Button type="submit" size="md" variant="secondary" pending={pending}>Mark resolved</Button>
      {state && !state.ok ? <p role="alert" className="text-xs text-danger-700 sm:basis-full">{state.message}</p> : null}
    </form>
  );
}

/** A change that costs more, waiting for its payment: pay it (the main action), cancel it, or (General Manager or Owner) apply it first. */
export function PendingChangeCard({
  reservationId,
  change,
  owedKobo,
  canApprove,
}: {
  reservationId: string;
  change: { id: string; description: string; amountKobo: number };
  owedKobo: number;
  canApprove: boolean;
}) {
  const [cancelState, cancelAction, cancelling] = useActionState(cancelPendingChange, null);
  const [approveState, approveAction, approving] = useActionState(applyChangeUnpaid, null);
  return (
    <div className="mt-6 rounded-card border border-gold-300 bg-gold-50 p-4 text-sm">
      <p className="font-medium text-ink-900">Waiting for payment: {change.description}</p>
      <p className="mt-0.5 text-ink-700">{formatNaira(change.amountKobo)} more. Nothing changes for the guest until it&apos;s paid.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TakePaymentLink reservationId={reservationId} balanceKobo={owedKobo} />
        <form action={cancelAction}>
          <input type="hidden" name="changeId" value={change.id} />
          <Button type="submit" variant="ghost" pending={cancelling}>Cancel this change</Button>
        </form>
      </div>
      {cancelState && !cancelState.ok ? <FormMessage>{cancelState.message}</FormMessage> : null}
      {canApprove ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-navy-800">Apply now, before payment (General Manager or Owner)</summary>
          <form action={approveAction} onSubmit={keepValues(approveAction)} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <input type="hidden" name="changeId" value={change.id} />
            <Input name="reason" required minLength={5} placeholder="Why it can't wait (saved in Activity)" className="flex-1 bg-ivory-50" aria-label="Reason" />
            <Button type="submit" variant="secondary" pending={approving}>Apply before payment</Button>
          </form>
          <p className="mt-1 text-xs text-ink-500">The guest then owes {formatNaira(change.amountKobo)} and can&apos;t check out until it&apos;s paid.</p>
          {approveState && !approveState.ok ? <FormMessage>{approveState.message}</FormMessage> : null}
        </details>
      ) : null}
    </div>
  );
}
