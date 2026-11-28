import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { bookingSource } from "@/domain/status";
import { owedOf } from "@/domain/next-step";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getReservation, hotelToday, reservationIdByReference } from "@/server/queries/reservations";
import { assignableRooms } from "@/server/queries/rooms";
import { ActionFeedbackProvider } from "./action-feedback";
import { BookingStatusBadge } from "./badges";
import { GuestAvatar } from "./guest-avatar";
import { PanelShell } from "./panel-shell";
import { AssignRoomForm, ChangeDatesForm } from "./reservation-actions";
import { NextAction } from "./reservation-guide";

/**
 * The booking side panel (interface brief I7, design R104): reference, guest and status; the stay and money as
 * facts; what is owed and until when; notes; Extend stay and Change room; then the one next action (the same
 * function as the booking page) as the large button at the foot, with Open booking and Change dates.
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
  const overdue = r.status === "checked_in" && r.checkOut < today;
  const hold = r.status === "pending_payment" && r.holdExpiresAt ? holdLabel(r.holdExpiresAt, today) : null;
  const changeable = canManage && (r.status === "confirmed" || r.status === "checked_in");
  return (
    <ActionFeedbackProvider>
      <div className="flex min-h-full flex-col" data-panel-reference={r.reference}>
        <header className="border-b border-hairline px-5 py-[18px] pr-16">
          <p className="text-[13px] text-[#5b6372]">{r.reference}</p>
          <h2 className="mt-0.5 mb-1.5 flex items-center gap-2 text-xl font-bold text-ink-900">
            <GuestAvatar name={r.guestName} size="sm" />
            {r.guestName}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge r={r} today={today} />
            {r.guestPhone ? <a href={`tel:${r.guestPhone}`} className="text-[13px] text-[#5b6372] hover:text-navy-700">{r.guestPhone}</a> : null}
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-3.5 px-5 py-4" data-money="">
          <Fact label="Arrive">{formatDate(r.checkIn, { year: today.slice(0, 4) })}</Fact>
          <Fact label="Leave">{formatDate(r.checkOut, { year: today.slice(0, 4) })} · {plural(r.nights, "night")}</Fact>
          <Fact label="Room">{r.category} · {r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-[#8a4b06]">no room yet</span>}</Fact>
          <Fact label="Source">{bookingSource[r.source]}</Fact>
          <Fact label="Total">{formatNaira(r.totalKobo + (r.pendingKobo ?? 0))}</Fact>
          <Fact label="Paid">{formatNaira(r.paidKobo)}</Fact>
          <Fact label="Owes"><span className={owed > 0 ? "text-[#8a4b06]" : "text-[#166534]"}>{formatNaira(owed)}</span></Fact>
          {hold ? <Fact label="Hold ends">{hold}</Fact> : <Fact label="Guests">{plural(r.guests, "guest")}</Fact>}
        </dl>

        <div className="space-y-2.5 px-5">
          {overdue ? (
            <p role="alert" className="rounded-[10px] bg-[#fde8e8] px-3.5 py-3 text-sm text-[#a61b1b]">
              <b>Overdue since {formatDate(r.checkOut, { year: false })}:</b> still checked in.
            </p>
          ) : null}
          {owed > 0 && hold ? (
            <p className="rounded-[10px] bg-[#fff4dc] px-3.5 py-3 text-sm text-[#8a4b06]" data-owes="">
              <b>Owes {formatNaira(owed)}.</b>{" "}
              The room is only held until {hold.replace(/^Today /, "")}.
            </p>
          ) : null}
          {r.attention ? (
            <p className="flex gap-2 rounded-[10px] bg-[#fff4dc] px-3.5 py-3 text-sm text-[#8a4b06]"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{r.attention}</p>
          ) : null}
          {r.specialRequests ? (
            <p className="rounded-[10px] bg-ivory-100 px-3.5 py-3 text-sm text-ink-700"><span className="font-semibold">Notes · </span>{r.specialRequests}</p>
          ) : null}
        </div>

        {changeable ? (
          <div className="mt-3 border-t border-hairline">
            <details className="group border-b border-hairline" data-extend="">
              <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-navy-700">Extend stay or change dates</summary>
              <ChangeDatesForm reservationId={r.id} checkIn={r.checkIn} checkOut={r.checkOut} inHouse={r.status === "checked_in"} />
            </details>
            <details className="group border-b border-hairline" data-change-room="">
              <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-navy-700">Change room</summary>
              <AssignRoomForm reservationId={r.id} current={r.roomNumber} rooms={rooms} booked={r.category} specialRequests={r.specialRequests} />
            </details>
          </div>
        ) : null}

        <div className="flex-1" />

        <div className="flex flex-col gap-2.5 border-t border-hairline px-5 py-4">
          {canManage ? (
            <div data-next-action="">
              <NextAction r={r} today={today} paymentsHref={`/app/payments/record?reservation=${r.id}`} assignHref={`${full}#change-stay`} />
            </div>
          ) : null}
          <div className="flex gap-2.5">
            <Link href={full} className={buttonStyles({ variant: "secondary", className: "flex-1" })}>Open booking</Link>
            {canManage && (r.status === "pending_payment" || changeable) ? (
              <Link href={`${full}#change-stay`} className={buttonStyles({ variant: "secondary", className: "flex-1" })}>Change dates</Link>
            ) : null}
          </div>
        </div>
      </div>
    </ActionFeedbackProvider>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-semibold text-[#5b6372]">{label}</dt>
      <dd className="text-[15px] font-semibold text-ink-900">{children}</dd>
    </div>
  );
}

/** "Today 18:00", or the date and time when the hold runs past today. */
function holdLabel(iso: string, today: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));
  return day === today ? `Today ${time}` : `${formatDate(day, { year: false })} ${time}`;
}
