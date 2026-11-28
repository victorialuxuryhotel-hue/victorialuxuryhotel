import { toConfirmSummary } from "@/server/domain/payment-checks";
import { currentFindings, forRole } from "@/server/domain/self-check";
import { actorOf, authorizeRead } from "@/server/auth";
import { getDb } from "@/server/db";
import type { Metadata } from "next";
import { owedOf } from "@/domain/next-step";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/management/page-header";
import { ReservationTable } from "@/components/management/reservation-table";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader, Stat, StatGrid } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatNaira } from "@/lib/format";
import { businessDate, hotelToday, addDays } from "@/lib/hotel-date";
import { roomBoardState, type RoomBoardState } from "@/domain/status";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/ui/choice";
import { notClosed } from "@/server/domain/pos";
import { cn } from "@/lib/utils/cn";
import { requireStaff } from "@/server/auth";
import { awaitingPaymentCount, departmentsOverview, revenueSummary } from "@/server/queries/dashboard";
import { listReservations, movements } from "@/server/queries/reservations";
import { roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Dashboard" };

const href = (r: { id: string }) => `/app/reservations/${r.id}`;

async function Departments({ canOpenHall }: { canOpenHall: boolean }) {
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
                  {r.key === "hall" && !canOpenHall ? (
                    <span className="font-medium text-ink-900">{r.label}</span>
                  ) : (
                    <Link href={r.href} className="font-medium text-ink-900 hover:underline">{r.label}</Link>
                  )}
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

/** Where each "Anything wrong?" item is dealt with, and the button that takes you there. */
const ACT: Record<string, [string, string]> = {
  payments_to_confirm: ["/app/payments/confirm", "Check"],
  online_payment_pending: ["/app/payments", "View"],
  overpaid: ["/app/payments", "View"],
  in_house_owes: ["/app/today", "Open Today"],
  overdue_checkout: ["/app/today", "Open Today"],
  not_arrived: ["/app/today", "Open Today"],
  paid_no_room: ["/app/today", "Open Today"],
  room_out_of_order: ["/app/rooms", "View"],
  closing_unverified: ["/app/sales/closing", "View"],
  not_closed: ["/app/sales/closing", "View"],
  pin_lockout: ["/app/staff", "View"],
};

const BAR: Record<RoomBoardState, string> = { occupied: "bg-navy-700", arriving: "bg-[#7c5cd6]", available: "bg-[#1f6f3a]", dirty: "bg-gold-500", maintenance: "bg-[#a61b1b]" };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const Count = ({ n }: { n: number }) => <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#eceae4] px-2 text-[13px] font-semibold tabular-nums text-ink-700">{n}</span>;

async function Content() {
  const staff = await requireStaff();
  if (staff.role === "front_desk" || staff.role === "hotel_manager") redirect("/app/today");
  if (staff.role === "restaurant_bar" || staff.role === "restaurant_bar_manager") redirect("/app/sales");
  const money = can(staff.role, "reports.view");
  const [m, rooms, awaiting, recent, toConfirm, findings, depts, late] = await Promise.all([
    movements(),
    roomBoard(),
    awaitingPaymentCount(),
    listReservations({ tab: "all" }),
    money ? authorizeRead("reports.view").then(async (r) => toConfirmSummary(await getDb(), actorOf(r))) : Promise.resolve({ count: 0, kobo: 0 }),
    // The self-check (rules section 4), live: the same list the alerts come from.
    money ? authorizeRead("reports.view").then(async () => forRole(await currentFindings(await getDb()), staff.role)) : Promise.resolve([]),
    money ? departmentsOverview() : Promise.resolve(null),
    // Not closed (FUNCTIONALITY 8): staff who sold yesterday and hadn't closed by 10:00. Owner and GM.
    staff.role === "owner" || staff.role === "general_manager"
      ? authorizeRead("pos.view").then(async (r) => notClosed(await getDb(), actorOf(r), addDays(businessDate(), -1))).catch(() => [])
      : Promise.resolve([]),
  ]);
  const occupied = rooms.filter((r) => r.state === "occupied").length;
  const unpaid = m.arrivals.filter((a) => owedOf(a) > 0).length;
  const overdue = m.departures.filter((d) => d.checkOut < m.today);
  const items = [
    ...(toConfirm.count && !findings.some((f) => f.check === "payments_to_confirm")
      ? [{ key: "to-confirm", check: "payments_to_confirm", urgent: false, message: `${toConfirm.count} payment${toConfirm.count === 1 ? "" : "s"} to confirm · ${formatNaira(toConfirm.kobo)}` }]
      : []),
    ...findings,
    ...late.map((n) => ({ key: `not-closed:${n.staff_id}`, check: "not_closed", urgent: false, message: `${n.name} sold ${formatNaira(n.kobo)} yesterday and hasn't closed the day` })),
  ];
  return (
    <div className="space-y-4 px-4 py-5 lg:px-8">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Occupancy tonight" value={`${rooms.length ? Math.round((occupied / rooms.length) * 100) : 0}%`} note={`${occupied} of ${rooms.length} rooms`} />
        {depts ? (
          <Kpi label="Taken today" value={formatNaira(depts.total.today)} note="rooms, bar, hall" />
        ) : (
          <Kpi label="In house" value={m.inHouse.length} note="guests checked in now" />
        )}
        <Kpi label="Arrivals" value={m.arrivals.length} note={unpaid ? `${unpaid} not paid` : "all paid"} />
        <Kpi label="Overdue" value={overdue.length} note="still in after check-out" tone={overdue.length ? "danger" : undefined} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {money ? (
          <section aria-labelledby="anything-wrong" className="overflow-clip rounded-xl border border-hairline bg-white" data-self-check="">
            <h2 id="anything-wrong" className="flex items-center gap-2.5 border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">Anything wrong? <Count n={items.length} /></h2>
            {items.length ? (
              <ul className="divide-y divide-hairline text-sm">
                {items.slice(0, 12).map((f) => {
                  const act = ACT[f.check];
                  return (
                    <li key={f.key} className="flex items-center gap-3 px-4 py-2.5">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", f.urgent ? "bg-[#a61b1b]" : "bg-[#b26a00]")} />
                      <span className={cn("min-w-0 flex-1", f.urgent ? "font-medium text-[#a61b1b]" : "text-ink-900")}>{f.message}</span>
                      {act ? <Link href={act[0]} className={buttonStyles({ variant: "secondary", size: "sm" })}>{act[1]}</Link> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-4 py-4 text-sm text-ink-500">Nothing needs you right now.</p>}
            {items.length > 12 ? <p className="border-t border-hairline px-4 py-2 text-xs text-ink-500">And {items.length - 12} more.</p> : null}
          </section>
        ) : null}

        <section className="overflow-clip rounded-xl border border-hairline bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <h2 className="text-base font-bold text-ink-900">Rooms right now</h2>
            <Link href="/app/rooms" className={buttonStyles({ variant: "ghost", size: "sm" })}>Room board</Link>
          </div>
          <div className="p-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-ivory-200">
              {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => {
                const n = rooms.filter((r) => r.state === s).length;
                return n ? <div key={s} className={BAR[s]} style={{ width: `${(n / rooms.length) * 100}%` }} /> : null;
              })}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-[15px]">
              {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => (
                <li key={s} className="flex items-center gap-2 text-ink-900">
                  <span aria-hidden className={cn("size-2.5 rounded-sm", BAR[s])} />
                  <span className="flex-1">{roomBoardState[s].label}</span>
                  <span className="font-bold tabular-nums">{rooms.filter((r) => r.state === s).length}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="overflow-clip rounded-xl border border-hairline bg-white">
        <h2 className="flex items-center gap-2.5 border-b border-hairline px-4 py-3 text-base font-bold text-ink-900">Arriving today <Count n={m.arrivals.length} /></h2>
        {m.arrivals.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-[13px] text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Guest</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Room</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {m.arrivals.map((a) => {
                  const owed = owedOf(a);
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-2.5">
                        <Link href={href(a)} className="flex items-center gap-2.5 font-semibold text-ink-900 hover:underline">
                          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[11px] font-bold text-navy-800">{initials(a.guestName)}</span>
                          {a.guestName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-ink-700">{a.category}{a.roomNumber ? ` · ${a.roomNumber}` : ""}</td>
                      <td className="px-4 py-2.5">
                        {owed > 0 ? <Badge tone="warning">Owes {formatNaira(owed)}</Badge> : !a.roomNumber ? <Badge tone="warning">Needs a room</Badge> : <Badge tone="success">Paid · ready</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="px-4 py-4 text-sm text-ink-500">No arrivals today.</p>}
      </section>

      {money ? (
        <>
          <Suspense fallback={<LoadingState label="Loading departments…" />}><Departments canOpenHall={can(staff.role, "events.manage")} /></Suspense>
          <Suspense fallback={<LoadingState label="Loading revenue…" />}><Revenue /></Suspense>
        </>
      ) : null}

      <p className="text-sm text-ink-500">{awaiting ? `${awaiting} booking${awaiting === 1 ? " is" : "s are"} held, not yet paid.` : "No bookings waiting for payment."}</p>

      <Card>
        <CardHeader title="Recent bookings" action={<Link href="/app/reservations?tab=all" className="text-sm font-medium text-navy-800">All bookings</Link>} />
        {recent.length ? <ReservationTable rows={recent.slice(0, 8)} hrefFor={href} today={m.today} /> : <div className="p-5"><EmptyState title="No bookings yet" /></div>}
      </Card>
    </div>
  );
}

async function NewBookingButton() {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return null;
  return <Link href="/app/reservations/new" className={buttonStyles({ className: "max-sm:size-11 max-sm:px-0" })} aria-label="New booking"><CalendarPlus className="size-4 sm:hidden" aria-hidden /><span className="hidden sm:inline">New booking</span></Link>;
}

const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(",", "");

/** The date is read at request time, inside the Suspense boundary (cacheComponents). */
async function Header() {
  await requireStaff();
  return (
    <PageHeader
      title="Dashboard"
      description={`${longDay(hotelToday())} · how the hotel is doing`}
      actions={<Suspense fallback={null}><NewBookingButton /></Suspense>}
    />
  );
}

export default function DashboardPage() {
  return (
    <>
      <Suspense fallback={<PageHeader title="Dashboard" />}><Header /></Suspense>
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
