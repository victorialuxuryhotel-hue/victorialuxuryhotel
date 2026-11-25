import type { Metadata } from "next";
import { owedOf } from "@/domain/next-step";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { MovementList } from "@/components/management/front-desk";
import { PageHeader } from "@/components/management/page-header";
import { ReservationTable } from "@/components/management/reservation-table";
import { RoomBoardLegend } from "@/components/management/room-board";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader, Stat, StatGrid } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { requireStaff } from "@/server/auth";
import { awaitingPaymentCount, departmentsOverview, revenueSummary } from "@/server/queries/dashboard";
import { listReservations, movements } from "@/server/queries/reservations";
import { roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Dashboard" };

const href = (r: { id: string }) => `/app/reservations/${r.id}`;

async function Departments() {
  const d = await departmentsOverview();
  const cell = "px-3 py-3 text-right tabular-nums whitespace-nowrap sm:px-4";
  return (
    <Card>
      <CardHeader title="Departments" description="Money received by each department, kept separate." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-500">
            <tr className="border-b border-hairline">
              <th scope="col" className="py-2.5 pr-2 pl-4 text-left font-medium sm:px-5">Department</th>
              <th scope="col" className={cn(cell, "font-medium")}>Today</th>
              <th scope="col" className={cn(cell, "pr-4 font-medium sm:pr-5")}>This month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {d.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="py-3 pr-2 pl-4 text-left font-normal sm:px-5">
                  <Link href={r.href} className="font-medium text-ink-900 hover:underline">{r.label}</Link>
                  <span className="block text-xs text-ink-500">{r.note}</span>
                </th>
                <td className={cell}>{formatNaira(r.today)}</td>
                <td className={cn(cell, "pr-4 font-semibold text-ink-900 sm:pr-5")}>{formatNaira(r.month)}</td>
              </tr>
            ))}
            <tr className="bg-ivory-100 font-semibold text-ink-900">
              <th scope="row" className="py-3 pr-2 pl-4 text-left sm:px-5">Whole business</th>
              <td className={cell}>{formatNaira(d.total.today)}</td>
              <td className={cn(cell, "pr-4 sm:pr-5")}>{formatNaira(d.total.month)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Revenue() {
  const r = await revenueSummary();
  return (
    <section aria-labelledby="money">
      <h2 id="money" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">This month</h2>
      <StatGrid>
        <Stat label="Received today" value={formatNaira(r.receivedToday)} caption="Verified payments only" />
        <Stat label="Received this month" value={formatNaira(r.receivedMonth)} caption="Verified money in: card online + desk payments, minus refunds" />
        <Stat label="Booked value" value={formatNaira(r.bookedValue)} caption="Stays arriving this month. Not cash received" />
        <Stat label="Owed" value={formatNaira(r.outstanding)} caption="Still to pay on confirmed stays" />
      </StatGrid>
      <Link href="/app/reports" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-navy-800 hover:text-gold-600">
        Daily figures, cash-up and occupancy in Reports <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

async function Content() {
  const staff = await requireStaff();
  if (staff.role === "front_desk" || staff.role === "hotel_manager") redirect("/app/today");
  if (staff.role === "restaurant_bar" || staff.role === "restaurant_bar_manager") redirect("/app/sales");
  const [m, rooms, awaiting, recent] = await Promise.all([movements(), roomBoard(), awaitingPaymentCount(), listReservations({ tab: "all" })]);
  const noRoom = m.arrivals.filter((a) => !a.roomNumber).length;
  const owing = m.departures.filter((d) => owedOf(d) > 0).length;
  return (
    <div className="space-y-8 px-4 py-6 lg:px-8">
      <p className="-mt-2 text-sm text-ink-500">{formatDate(m.today)}</p>
      <StatGrid>
        <Stat label="Arrivals today" value={m.arrivals.length} caption={noRoom ? `${noRoom} still need a room` : "All have rooms assigned"} />
        <Stat label="Departures due" value={m.departures.length} caption={owing ? `${owing} with money owed` : "Nothing owed"} />
        <Stat label="In house" value={m.inHouse.length} caption="Guests checked in now" />
        <Stat label="Awaiting payment" value={awaiting} caption="Held, not yet paid" />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <MovementList kind="arrivals" rows={m.arrivals} hrefFor={href} today={m.today} />
        <Card>
          <CardHeader title="Rooms right now" action={<Link href="/app/rooms" className="text-sm font-medium text-navy-800">Room board</Link>} />
          <div className="p-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-ivory-200">
              {(["occupied", "arriving", "available", "dirty", "maintenance"] as const).map((s) => {
                const colours = { occupied: "bg-navy-700", arriving: "bg-info-700", available: "bg-success-600", dirty: "bg-warning-600", maintenance: "bg-danger-600" };
                const n = rooms.filter((r) => r.state === s).length;
                return n ? <div key={s} className={colours[s]} style={{ width: `${(n / rooms.length) * 100}%` }} /> : null;
              })}
            </div>
            <div className="mt-5"><RoomBoardLegend rooms={rooms} /></div>
          </div>
        </Card>
      </div>

      {can(staff.role, "reports.view") ? (
        <>
          <Suspense fallback={<LoadingState label="Loading departments…" />}><Departments /></Suspense>
          <Suspense fallback={<LoadingState label="Loading revenue…" />}><Revenue /></Suspense>
        </>
      ) : null}

      <Card>
        <CardHeader title="Recent bookings" action={<Link href="/app/reservations?tab=all" className="text-sm font-medium text-navy-800">All bookings</Link>} />
        {recent.length ? <ReservationTable rows={recent.slice(0, 8)} hrefFor={href} today={m.today} /> : <div className="p-5"><EmptyState title="No bookings yet" /></div>}
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={<Link href="/app/reservations/new" className={buttonStyles({ className: "size-11 px-0 sm:size-auto sm:px-4" })} aria-label="New booking"><CalendarPlus className="size-4" aria-hidden /><span className="hidden sm:inline">New booking</span></Link>}
      />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
