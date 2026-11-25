import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { NeedsYou, RoomCounts } from "@/domain/today";
import type { ReservationRow } from "@/domain/views";
import { formatDate, formatNaira } from "@/lib/format";
import { ActionFeedbackProvider } from "./action-feedback";
import { MovementList } from "./front-desk";
import { ReservationTable } from "./reservation-table";

export type TodayLinks = {
  reservation: (id: string) => string;
  pay: (id: string) => string;
  rooms: (state?: "available" | "occupied" | "dirty") => string;
};

function describe(n: NeedsYou, links: TodayLinks) {
  const name = n.reservation.guestName;
  switch (n.kind) {
    case "unpaid":
      return {
        title: `${name} hasn't paid`,
        reason: `Arrives today · ${formatNaira(n.dueKobo)} owed before check-in`,
        action: "Take payment",
        href: links.pay(n.reservation.id),
      };
    case "no_room":
      return {
        title: `${name} has no room`,
        reason: `Arrives today · ${n.reservation.category}`,
        action: "Assign",
        href: `${links.reservation(n.reservation.id)}#change-stay`,
      };
    case "room_not_ready":
      return {
        title: `Room ${n.room.number} is ${n.room.readiness === "cleaning_in_progress" ? "being cleaned" : "dirty"}`,
        reason: `${name} arrives today`,
        action: n.room.readiness === "cleaning_in_progress" ? "Check" : "Clean",
        href: links.rooms("dirty"),
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
  links,
}: {
  firstName: string;
  greeting: string;
  today: string;
  needs: NeedsYou[];
  arrivals: ReservationRow[];
  departures: ReservationRow[];
  inHouse: ReservationRow[];
  counts: RoomCounts;
  links: TodayLinks;
}) {
  const href = (r: { id: string }) => links.reservation(r.id);
  return (
    <ActionFeedbackProvider>
      <div className="space-y-6 px-4 py-6 lg:px-8">
        <header>
          <h1 className="text-[1.75rem] leading-tight font-semibold text-ink-900">{greeting}, {firstName}</h1>
          <p className="mt-1 text-sm text-ink-500">{formatDate(today)}</p>
        </header>

        <section aria-labelledby="needs">
          <h2 id="needs" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
            Needs you now{needs.length ? ` · ${needs.length}` : ""}
          </h2>
          <Card>
            {needs.length === 0 ? (
              <div className="flex items-center gap-3 p-5">
                <CheckCircle2 className="size-6 shrink-0 text-success-700" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="font-medium text-ink-900">All set for today.</p>
                  <p className="text-sm text-ink-500">Today&apos;s arrivals are paid, have rooms, and the rooms are ready.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {needs.map((n) => {
                  const d = describe(n, links);
                  return (
                    <li key={`${n.kind}-${n.reservation.id}`}>
                      <Link href={d.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5">
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-gold-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink-900">{d.title}</span>
                          <span className="block text-sm text-ink-500">{d.reason}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-navy-800">
                          {d.action}
                          <ChevronRight className="size-4" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <MovementList kind="arrivals" title="Coming in today" rows={arrivals} hrefFor={href} />
          <MovementList kind="departures" title="Leaving today" rows={departures} hrefFor={href} />
        </div>

        <Card>
          <CardHeader
            title="In house"
            description="Guests checked in now."
            action={<span className="rounded-full bg-ivory-200 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{inHouse.length}</span>}
          />
          {inHouse.length ? <ReservationTable rows={inHouse} hrefFor={href} /> : <div className="p-5"><EmptyState title="No guests checked in" /></div>}
        </Card>

        <section aria-label="Rooms">
          <Card>
            <CardHeader title="Rooms" description="Right now" />
            <div className="grid grid-cols-3 divide-x divide-hairline">
              {([
                ["Ready", counts.ready, links.rooms("available")],
                ["Guests in", counts.guestsIn, links.rooms("occupied")],
                ["To clean", counts.toClean, links.rooms("dirty")],
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
