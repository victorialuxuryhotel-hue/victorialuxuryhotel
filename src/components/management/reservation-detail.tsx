import Link from "next/link";
import { AlertTriangle, ArrowLeft, BedDouble, CalendarDays, Clock, Mail, Phone, Printer, Users, Wallet } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { bookingSource, paymentMethod } from "@/domain/status";
import type { ReservationDetail as Detail } from "@/domain/views";
import { formatDate, formatDateTime, formatNaira, plural } from "@/lib/format";
import { PaidProgress, PaymentBadge, ReservationBadge } from "./badges";
import {
  AssignRoomForm,
  CancelForm,
  ChangeDatesForm,
  CheckInButton,
  CheckOutButton,
  DetailsForm,
  NoShowButton,
  OverrideForm,
  ResolveAttentionForm,
  type RoomOption,
} from "./reservation-actions";

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

/**
 * Reservation detail. Which actions are OFFERED depends on status and role;
 * whether they are ALLOWED is decided by the server and database every time.
 */
export function ReservationDetailView({
  r,
  today,
  backHref,
  paymentsHref,
  receiptHref,
  guestHref,
  rooms,
  canOverride = false,
  maxGuests,
  justCreated,
  paidReceipt,
}: {
  r: Detail & { roomId?: string };
  today: string;
  backHref: string;
  paymentsHref: string;
  receiptHref: (receipt: string) => string;
  guestHref?: string;
  rooms: RoomOption[];
  canOverride?: boolean;
  maxGuests: number;
  justCreated?: boolean;
  /** Receipt number of a payment just recorded, to confirm it to staff. */
  paidReceipt?: string;
}) {
  const balance = r.totalKobo - r.paidKobo;
  const open = r.status === "confirmed" || r.status === "pending_payment";
  const checkInBlocker =
    r.status !== "confirmed" ? undefined : !r.roomNumber ? "Assign a room first" : r.checkIn > today ? `Arrival is ${formatDate(r.checkIn)}` : undefined;

  return (
    <div className="px-4 py-6 lg:px-8">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Reservations
      </Link>

      {justCreated ? (
        <div className="mt-4">
          <FormMessage tone="success">
            Reservation {r.reference} created. The room is held until {r.holdExpiresAt ? formatDateTime(r.holdExpiresAt) : "payment"}. Record payment to confirm it.
          </FormMessage>
        </div>
      ) : null}

      {paidReceipt ? (
        <div className="mt-4">
          <FormMessage tone="success">
            Payment recorded. Receipt {paidReceipt}.{" "}
            <Link href={receiptHref(paidReceipt)} className="font-medium underline">Print receipt</Link>
          </FormMessage>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink-900">{r.guestName}</h1>
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
        <div className="flex flex-wrap items-start gap-2">
          {r.status === "confirmed" ? <CheckInButton reservationId={r.id} disabledReason={checkInBlocker} /> : null}
          {r.status === "checked_in" ? <CheckOutButton reservationId={r.id} balanceKobo={balance} /> : null}
          {balance > 0 && r.status !== "cancelled" && r.status !== "expired" ? (
            <Link href={paymentsHref} className={buttonStyles({ variant: "secondary" })}>
              <Wallet className="size-4" aria-hidden /> Record payment
            </Link>
          ) : null}
          {r.status === "confirmed" && r.checkIn <= today ? <NoShowButton reservationId={r.id} /> : null}
          {open ? <CancelForm reservationId={r.id} /> : null}
        </div>
      </div>

      {r.status === "pending_payment" && canOverride ? <OverrideForm reservationId={r.id} /> : null}

      {r.attention ? (
        <div role="alert" className="mt-6 flex gap-3 rounded-card border border-warning-600/30 bg-warning-50 p-4 text-sm text-warning-700">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Needs attention</p>
            <p className="mt-0.5">{r.attention}</p>
            {canOverride ? <ResolveAttentionForm reservationId={r.id} /> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Stay" />
            <div className="grid gap-6 p-5 sm:grid-cols-2">
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
            {r.specialRequests && r.status !== "checked_in" && !open ? (
              <div className="border-t border-ivory-200 px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-ink-500">Special requests</p>
                <p className="mt-1 text-sm text-ink-700">{r.specialRequests}</p>
              </div>
            ) : null}
            {open || r.status === "checked_in" ? (
              <>
                <DetailsForm reservationId={r.id} guests={r.guests} specialRequests={r.specialRequests} maxGuests={maxGuests} />
                <ChangeDatesForm reservationId={r.id} checkIn={r.checkIn} checkOut={r.checkOut} inHouse={r.status === "checked_in"} />
                <AssignRoomForm reservationId={r.id} current={r.roomNumber} rooms={rooms} booked={r.category} />
              </>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              action={balance > 0 && r.status !== "cancelled" && r.status !== "expired" ? (
                <Link href={paymentsHref} className="text-sm font-medium text-navy-800 hover:text-navy-600">Record payment</Link>
              ) : undefined}
            />
            <div className="grid gap-4 border-b border-ivory-200 p-5 sm:grid-cols-3">
              <div>
                <p className="text-xs text-ink-500">Total for stay</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatNaira(r.totalKobo)}</p>
                <p className="text-xs text-ink-500">{formatNaira(r.nightlyRateKobo)} × {plural(r.nights, "night")}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Received</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-success-700">{formatNaira(r.paidKobo)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Balance</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${balance > 0 ? "text-warning-700" : "text-ink-900"}`}>{formatNaira(Math.max(0, balance))}</p>
                <PaidProgress paidKobo={r.paidKobo} totalKobo={r.totalKobo} format={formatNaira} />
              </div>
            </div>
            {r.payments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-ivory-200">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="font-medium tabular-nums text-ink-900">{formatNaira(p.amountKobo)}</p>
                      <p className="text-xs text-ink-500">
                        {paymentMethod[p.method]} · {p.provider === "paystack" ? "Paystack" : `Recorded by ${p.recordedBy ?? "staff"}`}
                        {p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <PaymentBadge status={p.status} />
                      {p.receiptNumber ? (
                        <Link href={receiptHref(p.receiptNumber)} className="inline-flex items-center gap-1.5 text-sm text-navy-800 hover:text-navy-600">
                          <Printer className="size-4" aria-hidden /> Receipt
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Guest" action={guestHref ? <Link href={guestHref} className="text-sm font-medium text-navy-800">Profile</Link> : undefined} />
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
            </div>
          </Card>

          <Card>
            <CardHeader title="History" />
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
          </Card>
        </div>
      </div>
    </div>
  );
}
