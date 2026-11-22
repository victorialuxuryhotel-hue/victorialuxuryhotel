"use client";

import { useActionState, useState } from "react";
import { LogIn, LogOut, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { formatNaira } from "@/lib/format";
import { assignRoom, cancelReservation, changeDates, checkIn, checkOut, markNoShow, overridePayment, resolveAttention, updateReservationDetails } from "@/server/reservations";
import { ActionButton } from "./action-form";
import { useActionFeedback, withFeedback } from "./action-feedback";
import { keepValues } from "@/lib/forms";

export type RoomOption = { id: string; number: string; category: string; ready: boolean };

export function CheckInButton({ reservationId, roomNumber, disabledReason }: { reservationId: string; roomNumber?: string; disabledReason?: string }) {
  const feedback = useActionFeedback();
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

export function CheckOutButton({ reservationId, balanceKobo, size }: { reservationId: string; balanceKobo: number; size?: "sm" | "md" }) {
  const feedback = useActionFeedback();
  return (
    <ActionButton
      action={checkOut}
      fields={{ reservationId }}
      size={size}
      variant={size === "sm" ? "secondary" : "primary"}
      confirm={balanceKobo > 0 ? `${formatNaira(balanceKobo)} is still outstanding. Check out anyway?` : undefined}
      onSuccess={(d) => feedback({
        message: `Checked out. The room is marked for cleaning.${d.balanceKobo > 0 ? ` ${formatNaira(d.balanceKobo)} is still outstanding.` : ""}`,
        undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined,
      })}
    >
      <LogOut className="size-4" aria-hidden /> Check out
    </ActionButton>
  );
}

export function NoShowButton({ reservationId }: { reservationId: string }) {
  const feedback = useActionFeedback();
  return (
    <ActionButton
      action={markNoShow}
      fields={{ reservationId }}
      variant="ghost"
      confirm="Mark this guest as a no-show? The room is released for tonight."
      onSuccess={(d) => feedback({ message: "Marked as a no-show. The room is released.", undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined })}
    >
      No-show
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
  /** Shown while choosing, so a request like "ground floor" or "quiet room" shapes the choice. */
  specialRequests?: string;
}) {
  const feedback = useActionFeedback();
  const [chosen, setChosen] = useState("");
  const [state, action, pending] = useActionState(
    withFeedback(assignRoom, (d) => {
      const number = rooms.find((r) => r.id === chosen)?.number;
      feedback({
        message: number ? `${current ? "Moved to" : "Assigned"} Room ${number}.` : "Room updated.",
        undo: d.undoId ? { reservationId, undoId: d.undoId } : undefined,
      });
    }),
    null,
  );
  const sameCategory = rooms.filter((r) => r.category === booked);
  const others = rooms.filter((r) => r.category !== booked);
  const label = (r: RoomOption) => `Room ${r.number}${r.ready ? "" : " (not ready yet)"}`;
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3 border-t border-ivory-200 bg-ivory-50 px-5 py-4">
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
              {rooms.length ? `Choose a room` : "No free rooms for these dates"}
            </option>
            {sameCategory.length ? (
              <optgroup label={booked}>{sameCategory.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}</optgroup>
            ) : null}
            {others.length ? (
              <optgroup label="Other categories (upgrade or move)">
                {others.map((r) => <option key={r.id} value={r.id}>{label(r)} · {r.category}</option>)}
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
      <form action={action} onSubmit={keepValues(action)} className="absolute right-0 z-20 mt-2 w-80 space-y-3 rounded-card border border-ivory-200 bg-white p-4 shadow-lg">
        <input type="hidden" name="reservationId" value={reservationId} />
        <Field label="Reason for cancelling" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" name="reason" rows={2} required minLength={3} />
        </Field>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        <p className="text-xs text-ink-500">Any refund is handled separately, according to the hotel&apos;s cancellation policy.</p>
        <Button type="submit" variant="danger" pending={pending} className="w-full">Cancel reservation</Button>
      </form>
    </details>
  );
}

export function OverrideForm({ reservationId }: { reservationId: string }) {
  const [state, action, pending] = useActionState(overridePayment, null);
  return (
    <details className="mt-6 rounded-card border border-ivory-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-ink-900">Manager options: confirm without full payment, or extend the hold</summary>
      <form action={action} onSubmit={keepValues(action)} className="mt-4 space-y-3">
        <input type="hidden" name="reservationId" value={reservationId} />
        <Field label="Reason (recorded in the activity log)" htmlFor="override-reason">
          <Input id="override-reason" name="reason" required minLength={5} placeholder="e.g. Corporate guest, company paying on invoice" />
        </Field>
        {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
        {state?.ok ? <FormMessage tone="success">Done. The override is recorded.</FormMessage> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="action" value="extend" variant="secondary" pending={pending}>Extend hold by 24 hours</Button>
          <Button type="submit" name="action" value="confirm" pending={pending}>Confirm anyway</Button>
        </div>
      </form>
    </details>
  );
}

export function DetailsForm({ reservationId, guests, specialRequests, maxGuests }: { reservationId: string; guests: number; specialRequests?: string; maxGuests: number }) {
  const [state, action, pending] = useActionState(updateReservationDetails, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-3 border-t border-ivory-200 px-5 py-4">
      <input type="hidden" name="reservationId" value={reservationId} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Guests" htmlFor="d-guests"><Input id="d-guests" name="guests" type="number" min={1} max={maxGuests} defaultValue={guests} /></Field>
        <Field label="Special requests" htmlFor="d-req"><Input id="d-req" name="specialRequests" defaultValue={specialRequests} maxLength={1000} /></Field>
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
    <details className="border-t border-ivory-200 px-5 py-4 text-sm">
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
        {state?.ok ? <FormMessage tone="success">Dates updated.</FormMessage> : null}
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
      <Input id="resolve-note" name="note" required minLength={5} placeholder="How was this resolved? (recorded)" className="flex-1 bg-white" />
      <Button type="submit" size="md" variant="secondary" pending={pending}>Mark resolved</Button>
      {state && !state.ok ? <p role="alert" className="text-xs text-danger-700 sm:basis-full">{state.message}</p> : null}
    </form>
  );
}
