import type { Metadata } from "next";
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
import { requireStaff } from "@/server/auth";
import { awaitingPaymentCount, revenueSummary } from "@/server/queries/dashboard";
import { listReservations, movements } from "@/server/queries/reservations";
import { roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Dashboard" };

const href = (r: { id: string }) => `/app/reservations/${r.id}`;

async function Revenue() {
  const r = await revenueSummary();
  return (
    <section aria-labelledby="money">
      <h2 id="money" className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">This month</h2>
      <StatGrid>
        <Stat label="Received today" value={formatNaira(r.receivedToday)} caption="Verified payments only" />
        <Stat label="Received this month" value={formatNaira(r.receivedMonth)} caption="Verified money in: Paystack + offline, minus refunds" />
        <Stat label="Booked value" value={formatNaira(r.bookedValue)} caption="Stays arriving this month. Not cash received" />
        <Stat label="Outstanding" value={formatNaira(r.outstanding)} caption="Unpaid balances on confirmed stays" />
      </StatGrid>
      <Link href="/app/reports" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-navy-800 hover:text-gold-600">
        Daily figures, cash-up and occupancy in Reports <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

async function Content() {
  const staff = await requireStaff();
  // The front desk's home is Today; managers keep the dashboard.
  if (staff.role === "front_desk") redirect("/app/today");
  if (staff.role === "restaurant_bar") redirect("/app/sales");
  const [m, rooms, awaiting, recent] = await Promise.all([movements(), roomBoard(), awaitingPaymentCount(), listReservations({ tab: "all" })]);
  const noRoom = m.arrivals.filter((a) => !a.roomNumber).length;
  const owing = m.departures.filter((d) => d.totalKobo > d.paidKobo).length;
  return (
    <div className="space-y-8 px-4 py-6 lg:px-8">
      <p className="-mt-2 text-sm text-ink-500">{formatDate(m.today)}</p>
      <StatGrid>
        <Stat label="Arrivals today" value={m.arrivals.length} caption={noRoom ? `${noRoom} still need a room` : "All have rooms assigned"} />
        <Stat label="Departures due" value={m.departures.length} caption={owing ? `${owing} with a balance outstanding` : "No balances outstanding"} />
        <Stat label="In house" value={m.inHouse.length} caption="Guests checked in now" />
        <Stat label="Awaiting payment" value={awaiting} caption="Held, not yet paid" />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <MovementList kind="arrivals" rows={m.arrivals} hrefFor={href} />
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
        <Suspense fallback={<LoadingState label="Loading revenue…" />}><Revenue /></Suspense>
      ) : null}

      <Card>
        <CardHeader title="Recent bookings" action={<Link href="/app/reservations?tab=all" className="text-sm font-medium text-navy-800">All reservations</Link>} />
        {recent.length ? <ReservationTable rows={recent.slice(0, 8)} hrefFor={href} /> : <div className="p-5"><EmptyState title="No bookings yet" /></div>}
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={<Link href="/app/reservations/new" className={buttonStyles({ className: "size-11 px-0 sm:size-auto sm:px-4" })} aria-label="New reservation"><CalendarPlus className="size-4" aria-hidden /><span className="hidden sm:inline">New reservation</span></Link>}
      />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
