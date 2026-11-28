import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, ChevronRight, Search } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { SlashHint } from "./shortcuts";
import { HelpButton, HelpPurpose } from "./screen-help";
import { EmptyState } from "@/components/ui/feedback";
import type { NeedsYou, RoomCounts, tonightView } from "@/domain/today";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira } from "@/lib/format";
import { ActionFeedbackProvider } from "./action-feedback";
import { MovementList } from "./front-desk";
import { CheckOutButton, NoShowButton, TakePaymentLink } from "./reservation-actions";
import { cn } from "@/lib/utils/cn";
import { ReservationTable } from "./reservation-table";
import { TodaySection } from "./today-section";

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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** One guest row (design R4): initials, "Name · Room", what's happening, then the actions at the right end. */
function Row({ name, place, status, href, panel, urgent, children }: { name: string; place: string; status: ReactNode; href: string; panel: boolean; urgent?: boolean; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[13px] font-bold text-navy-900">{initials(name)}</span>
      <Link href={href} scroll={!panel} className="min-w-0 flex-1 hover:text-navy-700">
        <span className="block font-semibold text-ink-900">{name} · {place}</span>
        <span className={cn("block text-sm", urgent ? "text-[#a61b1b]" : "text-ink-600")}>{status}</span>
      </Link>
      <span className="flex shrink-0 flex-wrap items-center gap-2">{children}</span>
    </li>
  );
}

export function TodayView({
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
  toClean = [],
}: {
  firstName?: string;
  greeting?: string;
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
  /** "Signed in as … · Lock" for the shared front desk computer. */
  signedIn?: ReactNode;
  /** Room numbers waiting to be cleaned. */
  toClean?: string[];
}) {
  const href = (r: { id: string; reference: string }) => (links.panel ? links.panel(r) : links.reservation(r.id));
  const panel = Boolean(links.panel);
  const overdue = needs.filter((n) => n.kind === "overdue_checkout" || n.kind === "owes");
  const attention = needs.filter((n) => n.kind !== "overdue_checkout" && n.kind !== "owes");
  const chip = "inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-hairline bg-white px-3 text-sm font-semibold text-ink-900 hover:border-ink-400";
  return (
    <ActionFeedbackProvider>
      <div className="space-y-5 px-4 py-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-[22px] font-bold text-ink-900">Today</h1>
              <HelpButton />
            </div>
            <p className="mt-0.5 text-sm text-ink-500">{formatDate(today, { weekday: true, year: false })} · business day</p>
            <HelpPurpose className="mt-0.5 max-w-xl text-sm text-ink-500" />
          </div>
          <div className="flex flex-col items-end gap-2">
            {signedIn}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* "/" jumps here (front desk shortcut); searches all bookings. */}
              <form method="get" action="/app/reservations" className="relative w-80 max-w-full" role="search">
                <input type="hidden" name="tab" value="all" />
                <label className="sr-only" htmlFor="today-search">Find a booking</label>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <Input id="today-search" type="search" name="q" placeholder="Find a booking: name, phone, room" data-search="" aria-keyshortcuts="/" className="h-11 pl-9 pointer-fine:md:pr-9" />
                <SlashHint />
              </form>
              <Link href="/app/walk-in" className={buttonStyles({ variant: "secondary" })}>Walk-in</Link>
              <Link href="/app/reservations/new" className={buttonStyles()}>New booking</Link>
            </div>
          </div>
        </header>

        <nav aria-label="Today at a glance" className="flex flex-wrap gap-2">
          <a href="#overdue" className={chip}>Overdue <span className={cn("tabular-nums", overdue.length > 0 && "text-[#a61b1b]")}>{overdue.length}</span></a>
          <a href="#arriving" className={chip}>Arriving <span className="tabular-nums">{arrivals.length}</span></a>
          <a href="#leaving" className={chip}>Leaving <span className="tabular-nums">{departures.length}</span></a>
          <Link href={links.rooms("dirty")} className={chip}>To clean <span className={cn("tabular-nums", counts.toClean > 0 && "text-[#8a4b06]")}>{counts.toClean}</span></Link>
        </nav>

        <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-4">
            {tonight.overbooked.length ? (
              <ul className="space-y-2">
                {tonight.overbooked.map((t) => (
                  <li key={`overbooked-${t.categoryId}`} data-kind="overbooked" role="alert" className="rounded-xl border border-[#f1b8b8] bg-[#fde8e8] px-4 py-3 text-sm text-[#a61b1b]">
                    <b>Overbooked: {t.name} tonight.</b> {-t.free} more {t.name} {-t.free === 1 ? "booking" : "bookings"} than rooms in service. Move a guest to another type, or bring a room back into service.{" "}
                    <Link href={links.rooms()} className="font-semibold underline">Rooms</Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {overdue.length ? (
              <TodaySection id="overdue" title="Overdue: still in after check-out" count={overdue.length} tone="danger">
                <ul className="divide-y divide-hairline">
                  {overdue.map((n) => {
                    const d = describe(n, links);
                    const r = n.reservation;
                    return (
                      <Row key={r.id} name={r.guestName} place={r.roomNumber ? `Room ${r.roomNumber}` : r.category} status={d.reason} href={href(r)} panel={panel} urgent>
                        {d.alt}
                        {d.action}
                      </Row>
                    );
                  })}
                </ul>
              </TodaySection>
            ) : null}

            {attention.length ? (
              <TodaySection id="attention" title="Needs you now" count={attention.length}>
                <ul className="divide-y divide-hairline">
                  {attention.map((n) => {
                    const d = describe(n, links);
                    const r = n.reservation;
                    return (
                      <Row key={r.id} name={r.guestName} place={r.roomNumber ? `Room ${r.roomNumber}` : r.category} status={d.reason} href={href(r)} panel={panel} urgent={d.urgent}>
                        {d.alt}
                        {d.action}
                      </Row>
                    );
                  })}
                </ul>
              </TodaySection>
            ) : null}

            <TodaySection id="arriving" title="Arriving today" count={arrivals.length}>
              <MovementList kind="arrivals" rows={arrivals} hrefFor={href} today={today} done={progress.arrived} bare />
            </TodaySection>
            <TodaySection id="leaving" title="Leaving today" count={departures.length} defaultOpen={departures.length <= 6}>
              <MovementList kind="departures" rows={departures} hrefFor={href} today={today} done={progress.left} bare />
            </TodaySection>
            <TodaySection id="in-house" title="In house" count={inHouse.length} defaultOpen={false}>
              {inHouse.length ? <ReservationTable rows={inHouse} hrefFor={href} today={today} inHouse /> : <div className="p-5"><EmptyState title="No guests checked in" /></div>}
            </TodaySection>
            {needs.length + tonight.overbooked.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink-600"><CheckCircle2 className="size-5 text-[#166534]" aria-hidden /> Nothing needs you right now.</p>
            ) : null}
          </div>

          <aside className="space-y-4">
            <TonightSection tonight={tonight} newBooking={links.newBooking} />
            <section aria-labelledby="to-clean" className="rounded-xl border border-hairline bg-white p-4">
              <h2 id="to-clean" className="text-base font-bold text-ink-900">Rooms to clean · {counts.toClean}</h2>
              <p className="mt-1 text-sm text-ink-600 tabular-nums">{toClean.length ? toClean.join(", ") : "None. Every free room is ready."}</p>
              <Link href={links.rooms()} className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-3" })}>Open rooms</Link>
            </section>
          </aside>
        </div>
      </div>
    </ActionFeedbackProvider>
  );
}

/** Interface brief I2 / design R4 "Free tonight": what can be sold tonight, per room type, counted as the website counts. */
function TonightSection({ tonight, newBooking }: { tonight: ReturnType<typeof tonightView>; newBooking: (categoryId: string) => string }) {
  if (tonight.cards.length === 0) return null;
  const held = tonight.cards.reduce((n, c) => n + c.held, 0);
  return (
    <section aria-labelledby="tonight" className="rounded-xl border border-hairline bg-white p-4">
      <h2 id="tonight" className="text-base font-bold text-ink-900">Free tonight</h2>
      {tonight.fullyBooked ? (
        <p className="mt-2 text-sm text-ink-600" data-testid="fully-booked">
          Fully booked tonight.{held ? ` ${held} unpaid ${held === 1 ? "hold" : "holds"}: a room comes free if a hold runs out.` : ""}
        </p>
      ) : null}
      <ul className="mt-2 divide-y divide-hairline">
        {tonight.cards.map((c) => (
          <li key={c.categoryId} data-tonight={c.categoryId} className="flex items-center justify-between gap-3 py-2">
            <span className="text-[15px] text-ink-900">{c.name}{c.held ? <span className="text-xs text-ink-500"> · {c.held} on hold</span> : null}</span>
            {c.full ? (
              <span className="text-sm font-semibold text-[#a61b1b]">0 free</span>
            ) : (
              <Link href={newBooking(c.categoryId)} className="text-sm font-semibold text-navy-700 tabular-nums hover:underline" title={`New ${c.name} booking · ${formatNaira(c.rateKobo)}`}>
                {c.shown} free
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
