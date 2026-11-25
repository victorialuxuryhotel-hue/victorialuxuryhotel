import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, nightsBetween, plural } from "@/lib/format";
import { ReservationBadge } from "./badges";
import { nextStep } from "@/domain/next-step";
import { cn } from "@/lib/utils/cn";
import { CheckInButton, CheckOutButton, TakePaymentLink } from "./reservation-actions";

export function MovementList({
  kind,
  rows,
  hrefFor,
  title,
  today,
}: {
  kind: "arrivals" | "departures";
  title?: string;
  rows: ReservationRow[];
  hrefFor: (r: ReservationRow) => string;
  /** Hotel date, worked out by the page on the server (reading the clock while rendering breaks prerendering). */
  today: string;
}) {
  const arrivals = kind === "arrivals";
  return (
    <Card>
      <CardHeader
        title={title ?? (arrivals ? "Arrivals" : "Departures")}
        description={arrivals ? "Payment first, then a clean room, then the key." : "Take any payment owed, then check the guest out."}
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
            const overdue = !arrivals && r.checkOut < today;
            return (
              <li key={r.id} className={cn("flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4", overdue && "bg-danger-50")}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={hrefFor(r)} className="font-medium text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                    <ReservationBadge status={r.status} />
                    {overdue ? <span className="rounded-full border border-danger-600/30 bg-white px-2 py-0.5 text-xs font-semibold text-danger-700">Overdue since {formatDate(r.checkOut, { year: false })}</span> : null}
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
