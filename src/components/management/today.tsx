import Link from "next/link";
import type { ReactNode } from "react";
import { BedDouble, CheckCircle2, ChevronRight, Plus, Search } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { SlashHint } from "./shortcuts";
import { HelpButton, HelpPurpose } from "./screen-help";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { NeedsYou, RoomCounts, tonightView } from "@/domain/today";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira } from "@/lib/format";
import { ActionFeedbackProvider } from "./action-feedback";
import { MovementList } from "./front-desk";
import { CheckOutButton, NoShowButton, TakePaymentLink } from "./reservation-actions";
import { cn } from "@/lib/utils/cn";
import { ReservationTable } from "./reservation-table";

export type TodayLinks = {
  reservation: (id: string) => string;
  /** The booking side panel (I7); falls back to the booking page. */
  panel?: (r: { id: string; reference: string }) => string;
  pay: (id: string) => string;
  rooms: (state?: "available" | "occupied" | "dirty" | "maintenance") => string;
  /** New booking for tonight, with the room type chosen. */
  newBooking: (categoryId: string) => string;
};

const short = (d: string) => formatDate(d, { year: false });
const linkStyle = "inline-flex min-h-10 items-center gap-0.5 whitespace-nowrap px-2 text-sm font-medium text-navy-800 hover:underline";

/** Title, reason, the one main action and (sometimes) a quieter alternative, for one guest. */
function describe(n: NeedsYou, links: TodayLinks): { title: string; reason: string; action: ReactNode; alt?: ReactNode; urgent?: boolean } {
  const r = n.reservation;
  const open = (label: string, hash = "") => (
    <Link href={`${links.reservation(r.id)}${hash}`} className={linkStyle}>
      {label}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
  const room = r.roomNumber ? `Room ${r.roomNumber}` : r.category;
  switch (n.kind) {
    case "owes":
      return {
        title: `${r.guestName} owes ${formatNaira(n.owedKobo)}`,
        reason: `In house · ${room} · due out ${short(r.checkOut)}`,
        action: <TakePaymentLink reservationId={r.id} balanceKobo={n.owedKobo} size="sm" />,
        urgent: true,
      };
    case "overdue_checkout":
      return {
        title: `${r.guestName} · due out ${short(r.checkOut)}`,
        reason: `Overdue · still checked in to ${room}`,
        action: <CheckOutButton reservationId={r.id} balanceKobo={0} size="sm" />,
        alt: open("Change dates", "#change-stay"),
        urgent: true,
      };
    case "not_arrived":
      return {
        title: `${r.guestName} · due ${short(r.checkIn)}`,
        reason: `Paid, not checked in · holding ${room}`,
        action: <NoShowButton reservationId={r.id} size="sm" />,
        alt: open("Still coming", "#change-stay"),
      };
    case "unpaid":
      return {
        title: `${r.guestName} hasn't paid`,
        reason: `Arrives today · ${formatNaira(n.owedKobo)} owed before check-in`,
        action: <TakePaymentLink reservationId={r.id} balanceKobo={n.owedKobo} size="sm" />,
      };
    case "no_room":
      return { title: `${r.guestName} has no room`, reason: `Arrives today · paid · ${r.category}`, action: open("Assign room", "#change-stay") };
    case "room_occupied":
      return {
        title: `${r.guestName}'s room is occupied`,
        reason: `Arrives today · ${n.occupant.guestName} is still checked in to Room ${r.roomNumber}`,
        action: open("Choose another room", "#change-stay"),
        urgent: true,
      };
    case "room_not_ready":
      return {
        title: `Room ${n.room.number} is ${n.room.readiness === "cleaning_in_progress" ? "being cleaned" : "not clean yet"}`,
        reason: `${r.guestName} arrives today · paid`,
        action: (
          <Link href={links.rooms("dirty")} className={linkStyle}>
            Rooms to clean
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ),
      };
  }
}

export function TodayView({
  firstName,
  greeting,
  today,
  needs,
  arrivals,
  departures,
  inHouse,
  counts,
  tonight,
  progress,
  links,
  signedIn,
}: {
  firstName: string;
  greeting: string;
  today: string;
  needs: NeedsYou[];
  arrivals: ReservationRow[];
  departures: ReservationRow[];
  inHouse: ReservationRow[];
  counts: RoomCounts;
  tonight: ReturnType<typeof tonightView>;
  /** Already arrived / left today, counted like the lists (I3). */
  progress: { arrived: number; left: number };
  links: TodayLinks;
  /** "Signed in as … · Switch user" for the shared front desk computer. */
  signedIn?: ReactNode;
}) {
  const href = (r: { id: string; reference: string }) => (links.panel ? links.panel(r) : links.reservation(r.id));
  const needsCount = needs.length + tonight.overbooked.length;
  return (
    <ActionFeedbackProvider>
      <div className="space-y-6 px-4 py-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-[1.75rem] leading-tight font-semibold text-ink-900">{greeting}, {firstName}</h1>
              <HelpButton />
            </div>
            <p className="mt-1 text-sm text-ink-500">{formatDate(today)}</p>
            <HelpPurpose className="mt-0.5 max-w-xl text-sm text-ink-500" />
          </div>
          <div className="flex flex-col items-end gap-2">
            {signedIn}
            {/* "/" jumps here (front desk shortcut); searches all bookings. */}
            <form method="get" action="/app/reservations" className="relative w-72 max-w-full" role="search">
              <input type="hidden" name="tab" value="all" />
              <label className="sr-only" htmlFor="today-search">Find a booking</label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input id="today-search" type="search" name="q" placeholder="Find a booking: name, phone or VL-…" data-search="" aria-keyshortcuts="/" className="h-10 pl-9 pointer-fine:md:pr-9" />
              <SlashHint />
            </form>
          </div>
        </header>

        <section aria-labelledby="needs">
          <h2 id="needs" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
            Needs you now{needsCount ? ` · ${needsCount}` : ""}
          </h2>
          <Card>
            {needsCount === 0 ? (
              <div className="flex items-center gap-3 p-5">
                <CheckCircle2 className="size-6 shrink-0 text-success-700" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="font-medium text-ink-900">Nothing needs you right now.</p>
                  <p className="text-sm text-ink-500">Nobody owes money, nobody is overdue, and today&apos;s arrivals are paid with clean rooms.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {tonight.overbooked.map((t) => (
                  <li key={`overbooked-${t.categoryId}`} data-kind="overbooked" className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                    <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink-900">Overbooked: {t.name} tonight</span>
                      <span className="block text-sm text-danger-700">
                        {-t.free} more {t.name} {-t.free === 1 ? "booking" : "bookings"} than rooms in service. Move a guest to another type, or bring a room back into service.
                      </span>
                    </span>
                    <Link href={links.rooms()} className={linkStyle}>
                      Rooms
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </li>
                ))}
                {needs.map((n) => {
                  const d = describe(n, links);
                  return (
                    <li key={n.reservation.id} data-kind={n.kind} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", d.urgent ? "bg-danger-600" : "bg-gold-500")} />
                      <Link href={href(n.reservation)} scroll={!links.panel} className="min-w-0 flex-1 hover:text-navy-700">
                        <span className="block font-medium text-ink-900">{d.title}</span>
                        <span className={cn("block text-sm", d.urgent ? "text-danger-700" : "text-ink-500")}>{d.reason}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-1">
                        {d.alt}
                        {d.action}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <TonightSection tonight={tonight} newBooking={links.newBooking} />

        <div className="grid gap-6 xl:grid-cols-2">
          <MovementList kind="departures" title="Leaving today" rows={departures} hrefFor={href} today={today} done={progress.left} />
          <MovementList kind="arrivals" title="Arriving today" rows={arrivals} hrefFor={href} today={today} done={progress.arrived} />
        </div>

        <Card>
          <CardHeader
            title="In house"
            description="Guests checked in now."
            action={<span className="rounded-full bg-ivory-200 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{inHouse.length}</span>}
          />
          {inHouse.length ? <ReservationTable rows={inHouse} hrefFor={href} today={today} inHouse /> : <div className="p-5"><EmptyState title="No guests checked in" /></div>}
        </Card>

        <section aria-label="Rooms">
          <Card>
            <CardHeader title="Rooms" description="Right now" />
            <div className="grid grid-cols-4 divide-x divide-hairline">
              {([
                ["Ready", counts.ready, links.rooms("available")],
                ["Occupied", counts.occupied, links.rooms("occupied")],
                ["To clean", counts.toClean, links.rooms("dirty")],
                ["Out of order", counts.outOfOrder, links.rooms("maintenance")],
              ] as const).map(([label, n, to]) => (
                <Link key={label} href={to} className="flex min-h-20 flex-col items-center justify-center px-2 py-3 hover:bg-ivory-50">
                  <span className="text-2xl font-semibold tabular-nums text-ink-900">{n}</span>
                  <span className="text-sm text-ink-500">{label}</span>
                </Link>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </ActionFeedbackProvider>
  );
}

/** Interface brief I2: what can be sold tonight, per room type, counted as the website and the booking form count. */
function TonightSection({ tonight, newBooking }: { tonight: ReturnType<typeof tonightView>; newBooking: (categoryId: string) => string }) {
  if (tonight.cards.length === 0) return null;
  const held = tonight.cards.reduce((n, c) => n + c.held, 0);
  return (
    <section aria-labelledby="tonight">
      <h2 id="tonight" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Available tonight</h2>
      {tonight.fullyBooked ? (
        <Card>
          <div className="flex items-center gap-3 p-5" data-testid="fully-booked">
            <BedDouble className="size-6 shrink-0 text-ink-400" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="font-medium text-ink-900">Fully booked tonight</p>
              {held ? <p className="text-sm text-ink-500">{held} unpaid {held === 1 ? "hold" : "holds"}: a room comes free if a hold runs out.</p> : null}
            </div>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tonight.cards.map((c) => (
            <li key={c.categoryId} data-tonight={c.categoryId}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{c.name}</p>
                  <p className={cn("text-sm", c.full ? "text-ink-500" : "text-ink-700")}>
                    {c.full ? (
                      "Full tonight"
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums text-ink-900">{c.shown}</span> of <span className="tabular-nums">{c.rooms}</span> free · {formatNaira(c.rateKobo)}
                      </>
                    )}
                    {c.held ? <span className="text-ink-500"> · {c.held} on hold</span> : null}
                  </p>
                </div>
                {c.full ? null : (
                  <Link href={newBooking(c.categoryId)} className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-auto self-start" })}>
                    <Plus className="size-4" aria-hidden />
                    New booking
                  </Link>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
