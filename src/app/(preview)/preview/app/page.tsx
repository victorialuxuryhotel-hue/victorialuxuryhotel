import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { RoomBoardLegend } from "@/components/management/room-board";
import { MovementList } from "@/components/management/front-desk";
import { PageHeader } from "@/components/management/page-header";
import { ReservationTable } from "@/components/management/reservation-table";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader, Stat, StatGrid } from "@/components/ui/card";
import { formatNaira } from "@/lib/format";
import { reservations, rooms, today } from "../_sample";

const href = () => "/preview/app/reservations/vl-7kq3pm";

export default function Page() {
  const arrivals = reservations.filter((r) => r.checkIn === "2026-12-01" && r.status !== "cancelled");
  const count = (s: string) => rooms.filter((r) => r.state === s).length;
  const daily = [42, 18, 65, 30, 0, 88, 54, 21, 47, 120, 35, 60, 28, 75];
  const max = Math.max(...daily);
  return (
    <>
      <PageHeader
        title="Good morning, Kemi"
        description="Tuesday 1 December 2026"
        actions={<Link href="/preview/app/reservations/new" className={buttonStyles({ className: "size-11 px-0 sm:size-auto sm:px-4" })} aria-label="New reservation"><CalendarPlus className="size-4" aria-hidden /><span className="hidden sm:inline">New reservation</span></Link>}
      />
      <div className="space-y-8 px-4 py-6 lg:px-8">
        <StatGrid>
          <Stat label="Arrivals today" value={arrivals.length} caption="2 still need a room" />
          <Stat label="Departures today" value={1} caption="1 balance outstanding" />
          <Stat label="In house" value={count("occupied")} caption="Guests checked in now" />
          <Stat label="Awaiting payment" value={1} caption="Held, not yet paid" />
        </StatGrid>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <MovementList kind="arrivals" rows={arrivals} hrefFor={href} today={today} />
          <Card>
            <CardHeader title="Rooms right now" action={<Link href="/preview/app/rooms" className="text-sm font-medium text-navy-800">Room board</Link>} />
            <div className="p-5">
              <div className="flex h-3 overflow-hidden rounded-full">
                {[["occupied", "bg-navy-700"], ["arriving", "bg-info-700"], ["available", "bg-success-600"], ["dirty", "bg-warning-600"], ["maintenance", "bg-danger-600"]].map(([s, c]) => (
                  <div key={s} className={c} style={{ width: `${(count(s!) / rooms.length) * 100}%` }} />
                ))}
              </div>
              <div className="mt-5"><RoomBoardLegend rooms={rooms} /></div>
            </div>
          </Card>
        </div>

        <section aria-labelledby="money">
          <h2 id="money" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">December so far</h2>
          <StatGrid className="xl:grid-cols-3">
            <Stat label="Payments received" value={formatNaira(48_650_000)} caption="Verified money in: Paystack + recorded offline" />
            <Stat label="Booked value" value={formatNaira(61_500_000)} caption="Confirmed stays this month. Not cash received" />
            <Stat label="Outstanding" value={formatNaira(12_850_000)} caption="Confirmed stays not yet fully paid" />
          </StatGrid>
          <Card className="mt-4">
            <CardHeader title="Payments received, last 14 days" description="Daily total of verified payments" />
            <div className="flex h-44 items-end gap-1.5 px-5 pt-4 pb-5" role="img" aria-label="Bar chart of daily payments received over the last 14 days">
              {daily.map((v, i) => (
                <div key={i} className="group relative flex-1">
                  <div className="rounded-t bg-navy-700 transition-colors group-hover:bg-gold-500" style={{ height: `${Math.max(2, (v / max) * 140)}px` }} />
                </div>
              ))}
            </div>
          </Card>
        </section>

        <Card>
          <CardHeader title="Recent bookings" action={<Link href="/preview/app/reservations" className="text-sm font-medium text-navy-800">All reservations</Link>} />
          <ReservationTable rows={reservations.slice(0, 5)} hrefFor={href} today={today} />
        </Card>
      </div>
    </>
  );
}
