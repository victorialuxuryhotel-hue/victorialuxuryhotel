import Link from "next/link";
import { owedOf } from "@/domain/next-step";
import { AlertTriangle, ArrowLeft, BedDouble, CalendarDays, Clock, Mail, Phone, Printer, Users } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { FormMessage } from "@/components/ui/form";
import { bookingSource, paymentMethod, staffRole } from "@/domain/status";
import type { ReservationDetail as Detail } from "@/domain/views";
import { hotel } from "@/config/hotel";
import { publicEnv } from "@/lib/env";
import { formatDate, formatDateTime, formatNaira, plural } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import { PaidProgress, PaymentBadge, ReservationBadge } from "./badges";
import {
  AssignRoomForm,
  CancelForm,
  ChangeDatesForm,
  CheckInButton,
  CheckOutButton,
  TakePaymentLink,
  DetailsForm,
  NoShowButton,
  OverrideForm,
  PendingChangeCard,
  ResolveAttentionForm,
  type RoomOption,
} from "./reservation-actions";
import { ActionFeedbackProvider } from "./action-feedback";
import { CorrectPaymentForm } from "./payment-correction";
import type { ManagerToAsk } from "@/server/domain/admin";
import { NextStepBar } from "./reservation-guide";
import { nextStep } from "@/domain/next-step";
import { reservationSteps, StepList } from "./reservation-steps";

function Fact({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-gold-600" strokeWidth={1.5} aria-hidden />
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
        <div className="mt-0.5 text-ink-900">{children}</div>
      </div>
    </div>
  );
}

export function ReservationDetailView({
  r,
  today,
  backHref,
  paymentsHref,
  receiptHref,
  billHref,
  guestHref,
  rooms,
  canOverride = false,
  canApprove = false,
  canManage = true,
  maxGuests,
  justCreated,
  paidReceipt,
  manager,
}: {
  r: Detail & { roomId?: string; publicToken?: string };
  today: string;
  backHref: string;
  paymentsHref: string;
  receiptHref: (receipt: string) => string;
  billHref?: string;
  guestHref?: string;
  rooms: RoomOption[];
  canOverride?: boolean;
  canApprove?: boolean;
  canManage?: boolean;
  maxGuests: number;
  justCreated?: boolean;
  paidReceipt?: string;
  manager?: ManagerToAsk | null;
}) {
  const balance = owedOf(r);
  const receiptLink = r.publicToken ? `${publicEnv().NEXT_PUBLIC_SITE_URL}/book/confirmation/${r.publicToken}` : null;
  const shareReceipt = (receipt: string) =>
    receiptLink
      ? whatsappLink(
          r.guestPhone,
          `Hello ${r.guestName.split(" ")[0]}, thank you for your payment to ${hotel.shortName}. Your receipt ${receipt} for booking ${r.reference}: ${receiptLink}`,
        )
      : null;
  const receiptsById = new Map(r.payments.map((p) => [p.id, p.receiptNumber]));
  const open = r.status === "confirmed" || r.status === "pending_payment";
  const steps = reservationSteps(r, today);
  const step = nextStep(r, today);

  return (
    <ActionFeedbackProvider>
    <div className="px-4 py-6 lg:px-8">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Bookings
      </Link>

      {justCreated ? (
        <div className="mt-4">
          <FormMessage tone="success">
            Booking {r.reference} created. The room is held until {r.holdExpiresAt ? formatDateTime(r.holdExpiresAt) : "payment"}. Take payment to confirm it.
          </FormMessage>
        </div>
      ) : null}

      {paidReceipt ? (
        <div className="mt-4">
          <FormMessage tone="success">
            Payment recorded. Receipt {paidReceipt}
            {r.guestEmail ? <> emailed to <span className="break-all">{r.guestEmail}</span></> : null}.{" "}
            <Link href={receiptHref(paidReceipt)} className="font-medium underline">Print receipt</Link>
          </FormMessage>
          {shareReceipt(paidReceipt) ? (
            <a
              href={shareReceipt(paidReceipt)!}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "secondary", className: "mt-2 w-full sm:w-auto" })}
            >
              Share on WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[1.75rem] leading-tight font-semibold text-ink-900 sm:text-2xl">{r.guestName}</h1>
            <ReservationBadge status={r.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            <span className="font-mono">{r.reference}</span> · {bookingSource[r.source]} · created {formatDateTime(r.createdAt)}
            {r.createdBy ? ` by ${r.createdBy}` : ""}
          </p>
          {r.status === "pending_payment" && r.holdExpiresAt ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-warning-700">
              <Clock className="size-4" aria-hidden /> Held until {formatDateTime(r.holdExpiresAt)}, then released if unpaid
            </p>
          ) : null}
        </div>
        <div className="hidden flex-wrap items-start gap-2 lg:flex">
          {canManage && step.kind === "take_payment" ? <TakePaymentLink reservationId={r.id} balanceKobo={step.owedKobo} /> : null}
          {canManage && step.kind === "check_in" ? <CheckInButton reservationId={r.id} roomNumber={r.roomNumber} /> : null}
          {canManage && (step.kind === "assign_room" || step.kind === "wait_for_arrival") ? (
            <CheckInButton reservationId={r.id} disabledReason={step.kind === "assign_room" ? "Assign a room first" : `Arrival is ${formatDate(step.checkIn)}`} />
          ) : null}
          {canManage && step.kind === "check_out" ? <CheckOutButton reservationId={r.id} balanceKobo={0} /> : null}
          {billHref && (r.status === "checked_in" || r.status === "checked_out") ? (
            <Link href={billHref} className={buttonStyles({ variant: "secondary" })}>
              <Printer className="size-4" aria-hidden /> Guest bill
            </Link>
          ) : null}
          {canManage && r.status === "confirmed" && r.checkIn <= today ? <NoShowButton reservationId={r.id} /> : null}
          {canManage && open ? <CancelForm reservationId={r.id} /> : null}
        </div>
      </div>

      {canManage && steps ? <div className="mt-5 lg:max-w-md"><StepList steps={steps} /></div> : null}

      {r.status === "pending_payment" && canOverride ? <div className="hidden lg:block"><OverrideForm reservationId={r.id} /></div> : null}
      {canManage && r.status === "pending_payment" && !canOverride ? (
        <p className="mt-6 hidden rounded-card border border-hairline bg-ivory-50 p-4 text-sm text-ink-700 lg:block">
          <span className="mr-2 rounded-full bg-ivory-200 px-2 py-0.5 text-xs font-medium text-ink-600">Manager</span>
          To hold the room longer, ask {manager ? `${manager.name} (${staffRole[manager.role]})` : "a manager"}.
        </p>
      ) : null}

      {canManage && r.pendingChange ? <PendingChangeCard reservationId={r.id} change={r.pendingChange} owedKobo={balance} canApprove={Boolean(canApprove)} /> : null}

      {r.attention ? (
        <div role="alert" className="mt-6 flex gap-3 rounded-card border border-warning-600/30 bg-warning-50 p-4 text-sm text-warning-700">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Needs attention</p>
            <p className="mt-0.5">{r.attention}</p>
            {canApprove ? <ResolveAttentionForm reservationId={r.id} /> : <p className="mt-1 text-xs">The general manager marks this resolved once it&apos;s sorted.</p>}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Stay" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:gap-6 sm:p-5">
              <Fact icon={CalendarDays} label="Dates">
                {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                <p className="text-sm text-ink-500">{plural(r.nights, "night")}</p>
              </Fact>
              <Fact icon={Users} label="Guests">{plural(r.guests, "guest")}</Fact>
              <Fact icon={BedDouble} label="Booked">{r.category}</Fact>
              <Fact icon={BedDouble} label="Room">
                {r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-ink-400">Not assigned</span>}
              </Fact>
            </div>
            {r.specialRequests && !(canManage && (r.status === "checked_in" || open)) ? (
              <div className="border-t border-hairline px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-ink-500">Special requests</p>
                <p className="mt-1 text-sm text-ink-700">{r.specialRequests}</p>
              </div>
            ) : null}
            {canManage && (open || r.status === "checked_in") ? (
              <div className="border-t border-hairline xl:border-0">
                <Collapsible id="change-stay" title={r.status === "pending_payment" ? "Change dates" : "Change dates or room"}>
                  <DetailsForm reservationId={r.id} guests={r.guests} specialRequests={r.specialRequests} maxGuests={maxGuests} />
                  <ChangeDatesForm reservationId={r.id} checkIn={r.checkIn} checkOut={r.checkOut} inHouse={r.status === "checked_in"} />
                  {r.status === "pending_payment" ? (
                    <p className="border-t border-hairline bg-ivory-50 px-5 py-4 text-sm text-ink-600">A room is given automatically once the booking is paid.</p>
                  ) : (
                    <AssignRoomForm reservationId={r.id} current={r.roomNumber} rooms={rooms} booked={r.category} specialRequests={r.specialRequests} />
                  )}
                </Collapsible>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              action={
                <span className="flex gap-4">
                  {billHref && r.status !== "cancelled" && r.status !== "expired" ? (
                    <Link href={billHref} className="text-sm font-medium text-navy-800 hover:text-navy-600">Guest bill</Link>
                  ) : null}
                </span>
              }
            />
            <div className="grid grid-cols-3 gap-3 border-b border-hairline p-4 sm:gap-4 sm:p-5">
              <div>
                <p className="text-xs text-ink-500">Total for stay</p>
                <p className="mt-1 text-base sm:text-lg font-semibold tabular-nums">{formatNaira(r.totalKobo)}</p>
                <p className="text-xs text-ink-500">{formatNaira(r.nightlyRateKobo)} × {plural(r.nights, "night")}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Received</p>
                <p className="mt-1 text-base sm:text-lg font-semibold tabular-nums text-success-700">{formatNaira(r.paidKobo)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Owed</p>
                <p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${balance > 0 ? "text-warning-700" : "text-ink-900"}`}>{formatNaira(Math.max(0, balance))}</p>
                <PaidProgress paidKobo={r.paidKobo} totalKobo={r.totalKobo} format={formatNaira} />
              </div>
            </div>
            {r.payments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-4">
                    {p.kind === "refund" ? (
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums text-ink-900">−{formatNaira(p.amountKobo)}</p>
                        <p className="text-xs text-ink-500">
                          Correction{p.correctsPaymentId && receiptsById.get(p.correctsPaymentId) ? ` to ${receiptsById.get(p.correctsPaymentId)}` : ""} by {p.recordedBy ?? "a manager"}
                          {p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ""}
                        </p>
                        {p.notes ? <p className="mt-0.5 text-xs text-ink-700">{p.notes}</p> : null}
                      </div>
                    ) : (
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums text-ink-900">
                        {formatNaira(p.amountKobo)}
                        {p.correctedKobo ? <span className="ml-2 text-xs font-normal text-ink-500">{formatNaira(p.correctedKobo)} corrected</span> : null}
                      </p>
                      <p className="text-xs text-ink-500">
                        {paymentMethod[p.method]} · {p.provider === "paystack" ? "Paid online" : `Taken by ${p.recordedBy ?? "staff"}`}
                        {p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ""}
                      </p>
                    </div>
                    )}
                    <div className="flex items-center gap-3">
                      <PaymentBadge status={p.status} />
                      {p.receiptNumber ? (
                        <Link href={receiptHref(p.receiptNumber)} className="inline-flex items-center gap-1.5 text-sm text-navy-800 hover:text-navy-600">
                          <Printer className="size-4" aria-hidden /> Receipt
                        </Link>
                      ) : null}
                    </div>
                    {canApprove && p.kind !== "refund" && p.status === "successful" && p.amountKobo - (p.correctedKobo ?? 0) > 0 ? (
                      <CorrectPaymentForm
                        paymentId={p.id}
                        reservationId={r.id}
                        receiptNumber={p.receiptNumber}
                        correctableKobo={p.amountKobo - (p.correctedKobo ?? 0)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <Collapsible
              id="guest"
              title="Guest · contact details"
              wideHeader={<CardHeader title="Guest" action={guestHref ? <Link href={guestHref} className="text-sm font-medium text-navy-800">Profile</Link> : undefined} />}
            >
            <div className="space-y-3 p-5 text-sm">
              <p className="text-base font-medium text-ink-900">{r.guestName}</p>
              {r.guestPhone ? (
                <a href={`tel:${r.guestPhone}`} className="flex items-center gap-2 text-ink-700 hover:text-navy-700">
                  <Phone className="size-4 text-ink-400" aria-hidden /> {r.guestPhone}
                </a>
              ) : null}
              {r.guestEmail ? (
                <a href={`mailto:${r.guestEmail}`} className="flex items-center gap-2 break-all text-ink-700 hover:text-navy-700">
                  <Mail className="size-4 text-ink-400" aria-hidden /> {r.guestEmail}
                </a>
              ) : null}
              {guestHref ? <Link href={guestHref} className="inline-flex min-h-10 items-center text-sm font-medium text-navy-800 xl:hidden">Guest profile</Link> : null}
            </div>
            </Collapsible>
          </Card>

          <Card>
            <Collapsible id="history" title={`History · ${plural(r.history.length, "event")}`} wideHeader={<CardHeader title="History" />}>
            <ol className="relative space-y-5 p-5 before:absolute before:top-7 before:bottom-7 before:left-[1.6rem] before:w-px before:bg-ivory-200">
              {r.history.map((h, i) => (
                <li key={i} className="relative flex gap-4">
                  <span aria-hidden className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full bg-gold-500 ring-4 ring-white" />
                  <div className="text-sm">
                    <p className="text-ink-900">{h.label}</p>
                    {h.note ? <p className="text-ink-500">{h.note}</p> : null}
                    <p className="mt-0.5 text-xs text-ink-400">
                      {formatDateTime(h.at)}
                      {h.by ? ` · ${h.by}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            </Collapsible>
          </Card>
        </div>
      </div>
      {canManage ? <NextStepBar key={r.status} r={r} today={today} paymentsHref={paymentsHref} canOverride={canOverride} manager={manager ?? null} /> : null}
    </div>
    </ActionFeedbackProvider>
  );
}
