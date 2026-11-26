import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { DashboardSkeleton, NextUp, ToDo, TodayList, dashboardTasks } from "@/components/management/dashboard";
import { PageHeader } from "@/components/management/page-header";
import { AssignRoomForm } from "@/components/management/reservation-actions";
import { RoomBoardLegend, roomStateColour } from "@/components/management/room-board";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { requireStaff } from "@/server/auth";
import { awaitingPaymentCount, departmentsOverview, revenueSummary } from "@/server/queries/dashboard";
import { listReservations, movements } from "@/server/queries/reservations";
import { assignableRooms, roomBoard } from "@/server/queries/rooms";
import type { ReservationRow } from "@/domain/views";

export const metadata: Metadata = { title: "Dashboard" };

async function Departments() {
  const d = await departmentsOverview();
  const cell = "px-4 py-3 text-right tabular-nums whitespace-nowrap";
  return (
    <Card>
      <CardHeader title="Departments" description="Money received by each department, kept separate." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-xs text-ink-500">
            <tr className="border-b border-hairline">
              <th scope="col" className="px-5 py-2.5 text-left font-medium">Department</th>
              <th scope="col" className={cn(cell, "font-medium")}>Today</th>
              <th scope="col" className={cn(cell, "pr-5 font-medium")}>This month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {d.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="px-5 py-3 text-left font-normal">
                  <Link href={r.href} className="font-medium text-ink-900 hover:underline">{r.label}</Link>
                  <span className="block text-xs text-ink-500">{r.note}</span>
                </th>
                <td className={cell}>{formatNaira(r.today)}</td>
                <td className={cn(cell, "pr-5 font-semibold text-ink-900")}>{formatNaira(r.month)}</td>
              </tr>
            ))}
            <tr className="bg-ivory-100 font-semibold text-ink-900">
              <th scope="row" className="px-5 py-3 text-left">Whole business</th>
              <td className={cell}>{formatNaira(d.total.today)}</td>
              <td className={cn(cell, "pr-5")}>{formatNaira(d.total.month)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Revenue() {
  const r = await revenueSummary();
  const max = Math.max(1, ...r.daily.map((d) => d.kobo));
  const figures: Array<[string, number, string]> = [
    ["Received today", r.receivedToday, "Verified payments only"],
    ["Received this month", r.receivedMonth, "Verified money in, minus refunds"],
    ["Booked value", r.bookedValue, "Stays this month. Not cash"],
    ["Outstanding", r.outstanding, "Unpaid on confirmed stays"],
  ];
  return (
    <Card className="px-[18px] py-4">
      <h2 className="sr-only">Money this month</h2>
      <div className="flex flex-wrap items-end justify-between gap-x-9 gap-y-4">
        <dl className="flex flex-wrap gap-x-9 gap-y-4">
          {figures.map(([label, kobo, caption]) => (
            <div key={label}>
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-900">{formatNaira(kobo)}</dd>
              <dd className="text-[11px] text-ink-500">{caption}</dd>
            </div>
          ))}
        </dl>
        <span className="text-xs text-ink-500">Verified payments, last 14 days</span>
      </div>
      <div className="mt-4 flex h-24 items-end gap-[5px]" role="img" aria-label="Bar chart of daily payments received over the last 14 days">
        {r.daily.map((d) => (
          <div
            key={d.day}
            title={`${formatDate(d.day, { year: false })}: ${formatNaira(d.kobo)}`}
            className={cn("flex-1 rounded-t-[3px]", d.day === r.today ? "bg-gold-500" : "bg-navy-700")}
            style={{ height: `${Math.max(3, (Math.max(0, d.kobo) / max) * 96)}px` }}
          />
        ))}
      </div>
      <Link href="/app/reports" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-navy-800 hover:text-gold-600">
        Daily figures, cash-up and occupancy in Reports <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

async function Content() {
  const staff = await requireStaff();
  if (staff.role === "front_desk" || staff.role === "hotel_manager") redirect("/app/today");
  if (staff.role === "restaurant_bar" || staff.role === "restaurant_bar_manager") redirect("/app/sales");
  const [m, rooms, awaiting, attention] = await Promise.all([movements(), roomBoard(), awaitingPaymentCount(), listReservations({ tab: "attention" })]);
  const canAct = can(staff.role, "reservations.manage");
  const unassigned = canAct ? m.arrivals.filter((a) => !a.roomNumber) : [];
  const options = new Map(await Promise.all(unassigned.map(async (a) => [a.id, await assignableRooms(a.id, a.checkIn, a.checkOut)] as const)));
  const assign = (r: ReservationRow) => {
    const free = options.get(r.id);
    return free ? <AssignRoomForm reservationId={r.id} rooms={free} booked={r.category} /> : undefined;
  };
  const chips: Array<[number, string, boolean]> = [
    [m.arrivals.length, m.arrivals.length === 1 ? "arrival" : "arrivals", false],
    [m.departures.length, m.departures.length === 1 ? "departure" : "departures", false],
    [m.inHouse.length, "staying now", false],
    [awaiting, "awaiting payment", awaiting > 0],
  ];
  return (
    <div className="space-y-5 px-4 py-5 lg:px-8 lg:py-7">
      <p className="text-[13px] text-ink-500">{formatDate(m.today)}</p>
      <NextUp arrivals={m.arrivals} departures={m.departures} today={m.today} canAct={canAct} />
      <ul className="flex flex-wrap gap-2">
        {chips.map(([n, label, warn]) => (
          <li key={label} className={cn("rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap", warn ? "border-gold-200 bg-warning-50 text-warning-700" : "border-hairline bg-white text-ink-900")}>
            <strong className="font-bold tabular-nums">{n}</strong> {label}
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <ToDo tasks={dashboardTasks({ attention, arrivals: m.arrivals, inHouse: m.inHouse, rooms, assign })} />
        <Card>
          <CardHeader title="Rooms right now" action={<Link href="/app/rooms" className="text-[13px] font-medium text-navy-800">Room board</Link>} />
          <div className="px-[18px] py-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-ivory-200">
              {(["occupied", "arriving", "available", "dirty", "maintenance"] as const).map((s) => {
                const n = rooms.filter((r) => r.state === s).length;
                return n ? <div key={s} className={roomStateColour[s]} style={{ width: `${(n / rooms.length) * 100}%` }} /> : null;
              })}
            </div>
            <div className="mt-3.5"><RoomBoardLegend rooms={rooms} stacked /></div>
          </div>
        </Card>
      </div>

      <TodayList arrivals={m.arrivals} departures={m.departures} today={m.today} canAct={canAct} />

      {can(staff.role, "reports.view") ? (
        <>
          <Suspense fallback={<LoadingState label="Loading revenue…" />}><Revenue /></Suspense>
          <Suspense fallback={<LoadingState label="Loading departments…" />}><Departments /></Suspense>
        </>
      ) : null}
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
      <Suspense fallback={<DashboardSkeleton />}><Content /></Suspense>
    </>
  );
}
