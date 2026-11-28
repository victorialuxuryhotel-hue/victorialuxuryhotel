import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira, nightsBetween, plural } from "@/lib/format";
import { ReservationBadge, SourceBadge } from "./badges";
import { nextStep, owedOf } from "@/domain/next-step";
import { movementProgress } from "@/domain/today";
import { cn } from "@/lib/utils/cn";
import { opensPanel } from "@/lib/panel";
import { CheckInButton, CheckOutButton, TakePaymentLink } from "./reservation-actions";
import { GuestAvatar } from "./guest-avatar";

export function MovementList({
  kind,
  rows,
  hrefFor,
  title,
  today,
  done,
  bare = false,
}: {
  kind: "arrivals" | "departures";
  title?: string;
  rows: ReservationRow[];
  hrefFor: (r: ReservationRow) => string;
  /** Hotel date, worked out by the page on the server (reading the clock while rendering breaks prerendering). */
  today: string;
  /** Guests who have already arrived / left today (I3). Shows "13 of 18 arrived" and a progress bar. */
  done?: number;
  /** Rows only (Today, design R4): the section around it has the heading and count. */
  bare?: boolean;
}) {
  const arrivals = kind === "arrivals";
  const progress = done === undefined ? null : movementProgress(kind, rows.length, done);
  const heading = title ?? (arrivals ? "Arrivals" : "Departures");
  if (bare) {
    return rows.length === 0 ? (
      <p className="px-4 py-4 text-sm text-ink-500">
        {progress && progress.total ? (arrivals ? "Everyone due today has arrived." : "Everyone due out has left.") : arrivals ? "No arrivals today." : "No departures today."}
      </p>
    ) : (
      <ul className="divide-y divide-hairline">
        {rows.map((r) => <MovementRow key={r.id} r={r} arrivals={arrivals} hrefFor={hrefFor} today={today} />)}
      </ul>
    );
  }
  return (
    <Card>
      <CardHeader
        title={progress && progress.total ? `${heading} · ${progress.label}` : heading}
        description={arrivals ? "Payment first, then a clean room, then the key." : "Take any payment owed, then check the guest out."}
        action={progress ? undefined : <span className="rounded-full bg-ivory-200 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{rows.length}</span>}
      />
      {progress && progress.total ? (
        <div
          role="progressbar"
          aria-label={`${heading}: ${progress.label}`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className="h-1 bg-ivory-200"
        >
          <div className="h-full bg-success-600 transition-[width]" style={{ width: `${progress.pct}%` }} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={
              progress && progress.total
                ? arrivals ? "Everyone due today has arrived" : "Everyone due out has left"
                : arrivals ? "No arrivals today" : "No departures today"
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((r) => {
            const balance = owedOf(r);
            const overdue = !arrivals && r.checkOut < today;
            return (
              <li key={r.id} className={cn("flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4", overdue && "bg-danger-50")}>
                <GuestAvatar name={r.guestName} className="self-start" />
                <div className="mr-auto min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={hrefFor(r)} scroll={!opensPanel(hrefFor(r))} className="font-medium text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                    <ReservationBadge status={r.status} />
                    <SourceBadge source={r.source} />
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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** One arriving or leaving guest (design R4): initials, "Name · Type · Room", payment and room status, the next action. */
function MovementRow({ r, arrivals, hrefFor, today }: { r: ReservationRow; arrivals: boolean; hrefFor: (r: ReservationRow) => string; today: string }) {
  const balance = owedOf(r);
  const overdue = !arrivals && r.checkOut < today;
  const step = nextStep(r, today);
  const status = arrivals
    ? balance > 0
      ? <span className="font-semibold text-[#8a4b06]">Owes {formatNaira(balance)}</span>
      : r.roomNumber
        ? "Paid · room ready"
        : "Paid · assign a room"
    : balance > 0
      ? <span className="font-semibold text-[#8a4b06]">Owes {formatNaira(balance)}</span>
      : overdue
        ? <span className="text-[#a61b1b]">Due out {formatDate(r.checkOut, { year: false })}</span>
        : "Paid · due out today";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[13px] font-bold text-navy-900">{initials(r.guestName)}</span>
      <Link href={hrefFor(r)} scroll={!opensPanel(hrefFor(r))} className="min-w-0 flex-1 hover:text-navy-700">
        <span className="block font-semibold text-ink-900">{r.guestName} · {r.category}{r.roomNumber ? ` · Room ${r.roomNumber}` : ""}</span>
        <span className="block text-sm text-ink-600">{status}</span>
      </Link>
      <span className="shrink-0 [&_button]:whitespace-nowrap">
        {step.kind === "take_payment" ? (
          <TakePaymentLink reservationId={r.id} balanceKobo={step.owedKobo} size="sm" />
        ) : step.kind === "assign_room" ? (
          <Link href={hrefFor(r)} className={buttonStyles({ size: "sm", variant: "secondary" })}>Assign room</Link>
        ) : step.kind === "check_in" ? (
          <CheckInButton reservationId={r.id} roomNumber={r.roomNumber} size="sm" />
        ) : step.kind === "check_out" ? (
          <CheckOutButton reservationId={r.id} balanceKobo={0} size="sm" />
        ) : (
          <Link href={hrefFor(r)} className={buttonStyles({ size: "sm", variant: "ghost" })}>Open</Link>
        )}
      </span>
    </li>
  );
}
