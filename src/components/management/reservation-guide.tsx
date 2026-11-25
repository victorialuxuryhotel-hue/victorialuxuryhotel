"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import type { ReservationDetail } from "@/domain/views";
import { keepValues } from "@/lib/forms";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { whatsappLink } from "@/lib/whatsapp";
import type { ManagerToAsk } from "@/server/domain/admin";
import { cancelReservation, markNoShow, overridePayment } from "@/server/reservations";
import { useActionFeedback, withFeedback } from "./action-feedback";
import { CheckInButton, CheckOutButton } from "./reservation-actions";
import { nextStep } from "@/domain/next-step";

type R = Pick<
  ReservationDetail,
  "id" | "status" | "guestName" | "category" | "roomNumber" | "checkIn" | "checkOut" | "totalKobo" | "paidKobo" | "source" | "createdAt"
>;

const reasons = ["Guest called to cancel", "Guest changed travel plans", "Booked by mistake", "Duplicate booking"];

function CancelConfirm({ r, onKeep }: { r: R; onKeep: () => void }) {
  const [state, action, pending] = useActionState(cancelReservation, null);
  const [reason, setReason] = useState(reasons[0]!);
  const first = r.guestName.split(" ")[0];
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-4 space-y-3 rounded-card border border-gold-500 p-4">
      <input type="hidden" name="reservationId" value={r.id} />
      <p className="text-lg font-semibold text-ink-900">Cancel this booking?</p>
      <p className="text-sm leading-relaxed text-ink-700">
        The {r.category} is released for {formatDate(r.checkIn, { year: false })} → {formatDate(r.checkOut, { year: false })}.{" "}
        {r.paidKobo > 0
          ? `${first} has paid ${formatNaira(r.paidKobo)}: arrange any refund under the cancellation policy.`
          : `${first} hasn't paid, so there's nothing to refund.`}{" "}
        This can&apos;t be undone.
      </p>
      <Field label="Reason" htmlFor="cancel-why">
        <Select id="cancel-why" value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((x) => <option key={x}>{x}</option>)}
          <option value="">Something else…</option>
        </Select>
      </Field>
      {reason === "" ? (
        <Field label="What happened?" htmlFor="cancel-other"><Input id="cancel-other" name="reason" required minLength={3} /></Field>
      ) : (
        <input type="hidden" name="reason" value={reason} />
      )}
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="secondary" size="lg" onClick={onKeep} className="whitespace-nowrap px-3">Keep booking</Button>
        <Button type="submit" variant="danger" size="lg" pending={pending}>Yes, cancel</Button>
      </div>
    </form>
  );
}

function NoShowConfirm({ r, onKeep }: { r: R; onKeep: () => void }) {
  const feedback = useActionFeedback();
  const [state, action, pending] = useActionState(
    withFeedback(markNoShow, (d) =>
      feedback({ message: "Marked as a no-show. The room is released.", undo: d.undoId ? { reservationId: r.id, undoId: d.undoId } : undefined }),
    ),
    null,
  );
  return (
    <form action={action} className="mt-4 space-y-3 rounded-card border border-gold-500 p-4">
      <input type="hidden" name="reservationId" value={r.id} />
      <p className="text-lg font-semibold text-ink-900">Mark {r.guestName.split(" ")[0]} as a no-show?</p>
      <p className="text-sm text-ink-700">The booking closes and the room is released for tonight. You can undo this for a few seconds afterwards.</p>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="secondary" size="lg" onClick={onKeep} className="whitespace-nowrap px-3">Keep booking</Button>
        <Button type="submit" variant="danger" size="lg" pending={pending}>Yes, no-show</Button>
      </div>
    </form>
  );
}

function OverrideInline({ id }: { id: string }) {
  const [state, action, pending] = useActionState(overridePayment, null);
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-4 space-y-3 rounded-card border border-hairline p-4">
      <input type="hidden" name="reservationId" value={id} />
      <Field label="Reason" htmlFor="ovr-why"><Input id="ovr-why" name="reason" required minLength={5} placeholder="e.g. Guest is sending the transfer tomorrow" /></Field>
      {state && !state.ok ? <FormMessage>{state.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Done. The room is held 24 hours more.</FormMessage> : null}
      <Button type="submit" name="action" value="extend" size="lg" className="w-full" pending={pending}>Hold 24 hours more</Button>
    </form>
  );
}

const roleName = { general_manager: "General manager", owner: "Owner" } as const;

function AskManager({ manager, what, onBack }: { manager: ManagerToAsk | null; what: string; onBack: () => void }) {
  const first = manager?.name.split(" ")[0];
  const wa = whatsappLink(manager?.phone, "");
  return (
    <div className="mt-4 space-y-3">
      <p className="text-base text-ink-900">Ask a manager to {what}.</p>
      {manager ? (
        <>
          <p className="text-sm text-ink-600">
            {manager.name} · {roleName[manager.role]}{manager.activeToday ? " · active today" : ""}
          </p>
          {manager.phone ? (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${manager.phone.replace(/[^\d+]/g, "")}`} className={buttonStyles({ size: "lg", className: "w-full" })}>Call {first}</a>
              {wa ? <a href={wa} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full" })}>WhatsApp {first}</a> : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-600">No manager is set up yet.</p>
      )}
      <Button variant="ghost" onClick={onBack} className="w-full">Back</Button>
    </div>
  );
}

export function NextStepBar({ r, today, paymentsHref, canOverride, manager = null }: { r: R; today: string; paymentsHref: string; canOverride: boolean; manager?: ManagerToAsk | null }) {
  const [sheet, setSheet] = useState<null | "menu" | "cancel" | "noshow" | "override" | "ask">(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const balance = r.totalKobo - r.paidKobo;
  const open = r.status === "pending_payment" || r.status === "confirmed";
  const closed = ["cancelled", "expired", "no_show", "checked_out"].includes(r.status);
  const canPay = balance > 0 && r.status !== "cancelled" && r.status !== "expired";
  const full = "w-full [&_form]:w-full [&_form]:items-stretch [&_button]:h-12 [&_button]:w-full [&_button]:text-base";

  const step = nextStep(r, today);
  const primaryIsPayment = step.kind === "take_payment";
  const primary: React.ReactNode = (() => {
    switch (step.kind) {
      case "take_payment":
        return <Link href={paymentsHref} className={buttonStyles({ size: "lg", className: "w-full" })}>Take payment · {formatNaira(step.owedKobo)}</Link>;
      case "assign_room":
        return <a href="#change-stay" className={buttonStyles({ size: "lg", className: "w-full" })}>Assign a room</a>;
      case "wait_for_arrival":
        return <Button size="lg" disabled className="w-full">Check in · Arrives {formatDate(step.checkIn, { year: false })}</Button>;
      case "check_in":
        return <div className={full}><CheckInButton reservationId={r.id} roomNumber={r.roomNumber} size="lg" /></div>;
      case "check_out":
        return <div className={full}><CheckOutButton reservationId={r.id} balanceKobo={0} size="lg" /></div>;
      default:
        return null;
    }
  })();

  const options: Array<{ label: string; hint: string; onSelect?: () => void; href?: string; disabled?: boolean; manager?: boolean }> = [];
  if (canPay && !primaryIsPayment) options.push({ label: "Take payment", hint: `${formatNaira(balance)} owed`, href: paymentsHref });
  if (!closed) options.push({ label: "Change dates or room", hint: "Price updates automatically", href: "#change-stay" });
  if (r.status === "confirmed") {
    const due = r.checkIn <= today;
    options.push({ label: "Mark as no-show", hint: due ? "Closes the booking and releases the room" : `Available from ${formatDate(r.checkIn, { year: false })}`, onSelect: () => setSheet("noshow"), disabled: !due });
  }
  if (r.status === "pending_payment" && canOverride) options.push({ label: "Hold the room longer", hint: "Managers only · reason recorded", onSelect: () => setSheet("override") });
  if (r.status === "pending_payment" && !canOverride) {
    options.push({ label: "Hold the room longer", hint: "A manager does this · tap to ask", onSelect: () => setSheet("ask"), manager: true });
  }
  if (open) options.push({ label: "Cancel booking", hint: "Releases the room", onSelect: () => setSheet("cancel") });

  if (!primary && options.length === 0) return null;
  const subtitle = `${r.guestName} · ${r.category}${r.roomNumber ? ` · Room ${r.roomNumber}` : ""}`;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 space-y-1 border-t border-hairline bg-ivory-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {primary}
        {options.length ? (
          <button ref={moreRef} type="button" onClick={() => setSheet("menu")} className="flex min-h-10 w-full items-center justify-center text-sm text-ink-700">
            Other options
          </button>
        ) : null}
      </div>
      <div aria-hidden className="h-32 lg:hidden" />
      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title="Other options" subtitle={subtitle} trigger={moreRef}>
        {sheet === "menu" ? (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {options.map((o) => (
              <li key={o.label}>
                {o.href ? (
                  <a href={o.href} onClick={() => setSheet(null)} className="flex min-h-14 flex-col justify-center py-2">
                    <span className="text-base text-ink-900">{o.label}</span>
                    <span className="text-sm text-ink-500">{o.hint}</span>
                  </a>
                ) : (
                  <button type="button" disabled={o.disabled} onClick={o.onSelect} className="flex min-h-14 w-full flex-col justify-center py-2 text-left disabled:opacity-60">
                    <span className={cn("flex items-center gap-2 text-base", o.manager ? "text-ink-500" : o.label.startsWith("Cancel") ? "text-danger-700" : "text-ink-900")}>
                      {o.label}
                      {o.manager ? <span className="rounded-full border border-ivory-300 px-2 py-0.5 text-xs text-ink-600">Manager</span> : null}
                    </span>
                    <span className="text-sm text-ink-500">{o.hint}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {sheet === "cancel" ? <CancelConfirm r={r} onKeep={() => setSheet("menu")} /> : null}
        {sheet === "noshow" ? <NoShowConfirm r={r} onKeep={() => setSheet("menu")} /> : null}
        {sheet === "override" ? <OverrideInline id={r.id} /> : null}
        {sheet === "ask" ? <AskManager manager={manager} what="hold this room longer" onBack={() => setSheet("menu")} /> : null}
      </BottomSheet>
    </>
  );
}
