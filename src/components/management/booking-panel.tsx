import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { owedOf } from "@/domain/next-step";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils/cn";
import { requireStaff } from "@/server/auth";
import { getReservation, hotelToday, reservationIdByReference } from "@/server/queries/reservations";
import { assignableRooms } from "@/server/queries/rooms";
import { ActionFeedbackProvider } from "./action-feedback";
import { ReservationBadge, SourceBadge } from "./badges";
import { PanelShell } from "./panel-shell";
import { AssignRoomForm, ChangeDatesForm } from "./reservation-actions";
import { NextAction } from "./reservation-guide";

/**
 * The booking side panel (interface brief I7): money line, stay, the one next action (the same
 * function as the booking page), notes, Extend stay and Change room, and the way to the full booking.
 */
export function BookingPanel({ reference, closeHref }: { reference: string; closeHref: string }) {
  return (
    <PanelShell title={`Booking ${reference}`} closeHref={closeHref}>
      <Suspense fallback={<p className="p-6 text-sm text-ink-500">Loading {reference}…</p>}>
        <PanelBody reference={reference} />
      </Suspense>
    </PanelShell>
  );
}

async function PanelBody({ reference }: { reference: string }) {
  const staff = await requireStaff();
  const id = await reservationIdByReference(reference);
  const r = id ? await getReservation(id) : null;
  if (!r) return <p className="p-6 text-sm text-ink-700">No booking {reference}. It may have been typed wrong.</p>;
  const today = await hotelToday();
  const canManage = can(staff.role, "reservations.manage");
  const live = ["pending_payment", "confirmed", "checked_in"].includes(r.status);
  const rooms = canManage && live && r.status !== "pending_payment" ? await assignableRooms(r.id, r.checkIn, r.checkOut) : [];
  const owed = owedOf(r);
  const full = `/app/reservations/${r.id}`;
  return (
    <ActionFeedbackProvider>
      <div className="space-y-0 divide-y divide-hairline" data-panel-reference={r.reference}>
        <header className="space-y-2 px-5 pt-5 pb-4 pr-14">
          <h2 className="text-2xl leading-tight text-ink-900">{r.guestName}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-500">{r.reference}</span>
            <ReservationBadge status={r.status} />
            <SourceBadge source={r.source} />
          </div>
        </header>

        <dl className="grid grid-cols-3 text-center" data-money="">
          {([
            ["Total", r.totalKobo, "text-ink-900"],
            ["Paid", r.paidKobo, "text-ink-900"],
            ["Owes", owed, owed > 0 ? "text-warning-700" : "text-success-700"],
          ] as const).map(([label, kobo, tone]) => (
            <div key={label} className="border-r border-hairline px-2 py-3 last:border-r-0">
              <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
              <dd className={cn("mt-0.5 font-semibold tabular-nums", tone)}>{formatNaira(Math.max(0, kobo))}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-1 px-5 py-4 text-sm text-ink-700">
          <p className="text-ink-900">
            {formatDate(r.checkIn, { year: false })} → {formatDate(r.checkOut, { year: false })} · {plural(r.nights, "night")}
          </p>
          <p>
            {r.category} · {r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-ink-500">no room yet</span>} · {plural(r.guests, "guest")}
          </p>
          {r.status === "checked_in" && r.checkOut < today ? (
            <p className="font-medium text-danger-700">Overdue since {formatDate(r.checkOut, { year: false })}: still checked in</p>
          ) : null}
          {r.guestPhone ? <p className="text-ink-500">{r.guestPhone}</p> : null}
        </div>

        {canManage ? (
          <div className="px-5 py-4" data-next-action="">
            <NextAction r={r} today={today} paymentsHref={`/app/payments/record?reservation=${r.id}`} assignHref={`${full}#change-stay`} />
          </div>
        ) : null}

        {r.attention || r.specialRequests ? (
          <div className="space-y-2 px-5 py-4 text-sm">
            {r.attention ? (
              <p className="flex gap-2 text-warning-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{r.attention}</p>
            ) : null}
            {r.specialRequests ? (
              <p className="text-ink-700"><span className="text-xs uppercase tracking-wide text-ink-500">Notes · </span>{r.specialRequests}</p>
            ) : null}
          </div>
        ) : null}

        {canManage && (r.status === "confirmed" || r.status === "checked_in") ? (
          <>
            <details className="group" data-extend="">
              <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium text-navy-800">Extend stay or change dates</summary>
              <ChangeDatesForm reservationId={r.id} checkIn={r.checkIn} checkOut={r.checkOut} inHouse={r.status === "checked_in"} />
            </details>
            <details className="group" data-change-room="">
              <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium text-navy-800">Change room</summary>
              <AssignRoomForm reservationId={r.id} current={r.roomNumber} rooms={rooms} booked={r.category} specialRequests={r.specialRequests} />
            </details>
          </>
        ) : null}

        <div className="px-5 py-4">
          <Link href={full} className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">
            Open full booking <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </ActionFeedbackProvider>
  );
}
