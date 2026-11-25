import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, nightsBetween, plural } from "@/lib/format";
import { ReservationBadge } from "./badges";
import { nextStep } from "@/domain/next-step";
import { hotelToday } from "@/lib/hotel-date";
import { CheckInButton, CheckOutButton, TakePaymentLink } from "./reservation-actions";

export function MovementList({
  kind,
  rows,
  hrefFor,
  title,
}: {
  kind: "arrivals" | "departures";
  title?: string;
  rows: ReservationRow[];
  hrefFor: (r: ReservationRow) => string;
}) {
  const arrivals = kind === "arrivals";
  const today = hotelToday();
  return (
    <Card>
      <CardHeader
        title={title ?? (arrivals ? "Arrivals" : "Departures")}
        description={arrivals ? "Assign a ready room, then check the guest in." : "Take any payment owed, then check the guest out."}
        action={<span className="rounded-full bg-ivory-200 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{rows.length}</span>}
      />
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title={arrivals ? "No arrivals today" : "No departures today"} />
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((r) => {
            const balance = r.totalKobo - r.paidKobo;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={hrefFor(r)} className="font-medium text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                    <ReservationBadge status={r.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-ink-500">
                    {r.category} · {r.roomNumber ? `Room ${r.roomNumber}` : <span className="text-warning-700">no room assigned</span>} ·{" "}
                    {plural(nightsBetween(r.checkIn, r.checkOut), "night")}
                    {arrivals ? "" : ` · since ${formatDate(r.checkIn, { year: false, weekday: false })}`}
                  </p>
                  {balance > 0 ? <p className="mt-1 text-sm font-medium text-warning-700">{formatNaira(balance)} owed</p> : null}
                </div>
                {(() => {
                  const step = nextStep(r, today);
                  switch (step.kind) {
                    case "take_payment":
                      return <div className="shrink-0"><TakePaymentLink reservationId={r.id} balanceKobo={step.owedKobo} size="sm" /></div>;
                    case "assign_room":
                      return <Link href={hrefFor(r)} className={buttonStyles({ size: "sm", variant: "secondary", className: "min-h-10 shrink-0 whitespace-nowrap" })}>Assign room</Link>;
                    case "check_in":
                      return <div className="shrink-0 [&_button]:whitespace-nowrap"><CheckInButton reservationId={r.id} roomNumber={r.roomNumber} /></div>;
                    case "check_out":
                      return <div className="shrink-0 [&_button]:whitespace-nowrap"><CheckOutButton reservationId={r.id} balanceKobo={0} size="sm" /></div>;
                    default:
                      return <Link href={hrefFor(r)} className={buttonStyles({ size: "sm", variant: "ghost", className: "min-h-10 shrink-0" })}>Open</Link>;
                  }
                })()}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
