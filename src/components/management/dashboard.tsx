import Link from "next/link";
import { Check } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { ReservationRow, RoomTile } from "@/domain/views";
import { formatNaira, nightsBetween, plural } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { NextStep } from "./next-step";

const href = (r: { id: string }) => `/app/reservations/${r.id}`;
const roomText = (r: ReservationRow) => (r.roomNumber ? `Room ${r.roomNumber}` : "no room assigned");
const balanceOf = (r: ReservationRow) => r.totalKobo - r.paidKobo;
const paymentText = (r: ReservationRow) => (balanceOf(r) > 0 ? `${formatNaira(balanceOf(r))} due` : "paid in full");

type Movements = { arrivals: ReservationRow[]; departures: ReservationRow[]; today: string; canAct: boolean };

/** The single most urgent guest: a ready arrival, then a departure, then anything blocking an arrival. */
export function NextUp({ arrivals, departures, today, canAct }: Movements) {
  const ready = arrivals.find((r) => r.status === "confirmed" && r.roomNumber);
  const leaving = departures[0];
  const blocked = arrivals.find((r) => r.status === "pending_payment") ?? arrivals.find((r) => !r.roomNumber);
  const r = ready ?? leaving ?? blocked;

  if (!r) {
    return (
      <section className="flex items-center gap-3.5 rounded-card bg-navy-950 px-5 py-[18px] text-ivory-50">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-navy-950"><Check className="size-5" strokeWidth={3} aria-hidden /></span>
        <div>
          <p className="text-lg font-semibold">Front desk is all caught up</p>
          <p className="text-[13px] text-ivory-200/75">No arrivals or departures are waiting.</p>
        </div>
      </section>
    );
  }

  const [when, title] =
    r === ready ? ["Arriving today", `${r.guestName} is arriving`]
    : r === leaving ? ["Leaving today", `${r.guestName} is leaving`]
    : r.status === "pending_payment" ? ["Arriving today", `${r.guestName} still needs to pay`]
    : ["Arriving today", `${r.guestName} needs a room`];

  return (
    <section aria-label="Next up" className="flex flex-wrap items-center justify-between gap-3.5 rounded-card bg-navy-950 px-5 py-[18px] text-ivory-50">
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-gold-300 uppercase">Next up · {when}</p>
        <p className="mt-1.5 text-xl font-semibold">{title}</p>
        <p className="text-[13px] text-ivory-200/75">{r.category} · {roomText(r)} · {paymentText(r)}</p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {canAct ? (
          <div className="[&_[role=alert]]:text-gold-200 [&_a]:border-gold-400 [&_a]:bg-gold-400 [&_a]:font-semibold [&_a]:text-navy-950 [&_button]:border-gold-400 [&_button]:bg-gold-400 [&_button]:font-semibold [&_button]:text-navy-950">
            <NextStep r={r} today={today} href={href(r)} />
          </div>
        ) : null}
        <Link href={href(r)} className="inline-flex h-10 items-center rounded-md border border-white/25 px-4 text-sm font-medium whitespace-nowrap hover:bg-white/10">Open booking</Link>
      </div>
    </section>
  );
}

export type Task = { key: string; title: string; detail: string; action: string; href: string; urgency: "high" | "medium" | "low" };

/** Everything waiting on a member of staff, written as tasks, most urgent first. */
export function dashboardTasks({ attention, arrivals, inHouse, rooms }: { attention: ReservationRow[]; arrivals: ReservationRow[]; inHouse: ReservationRow[]; rooms: RoomTile[] }): Task[] {
  const flagged = new Set(attention.map((r) => r.id));
  const waiting = arrivals.filter((r) => !flagged.has(r.id));
  const out = rooms.filter((r) => r.state === "maintenance");
  const tasks: Task[] = [
    ...attention.map((r): Task => ({ key: `a-${r.id}`, title: `Review ${r.guestName}'s booking`, detail: `${r.reference} · ${r.attention}`, action: "Review", href: href(r), urgency: "high" })),
    ...waiting.filter((r) => r.status === "pending_payment").map((r): Task => ({ key: `p-${r.id}`, title: `Take payment from ${r.guestName}`, detail: `Arrives today · ${formatNaira(balanceOf(r))} due`, action: "Take payment", href: href(r), urgency: "medium" })),
    ...waiting.filter((r) => !r.roomNumber).map((r): Task => ({ key: `r-${r.id}`, title: `Assign a room to ${r.guestName}`, detail: `${r.category} · arrives today`, action: "Assign room", href: href(r), urgency: "medium" })),
    ...inHouse.filter((r) => !flagged.has(r.id) && balanceOf(r) > 0).map((r): Task => ({ key: `b-${r.id}`, title: `Collect ${formatNaira(balanceOf(r))} from ${r.guestName}`, detail: `${roomText(r)} · staying now`, action: "Add payment", href: href(r), urgency: "medium" })),
  ];
  if (out.length) {
    tasks.push({ key: "out-of-service", title: `Fix ${plural(out.length, "room")} out of service`, detail: out.map((r) => r.number).join(", "), action: "View rooms", href: "/app/rooms?state=maintenance", urgency: "low" });
  }
  return tasks;
}

const urgencyDot = { high: "bg-danger-600", medium: "bg-warning-600", low: "bg-ink-400" };

export function ToDo({ tasks }: { tasks: Task[] }) {
  return (
    <Card>
      <CardHeader title="To do" action={<span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-700 tabular-nums">{tasks.length}</span>} />
      {tasks.length ? (
        <ul className="divide-y divide-hairline">
          {tasks.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center gap-2.5 px-[18px] py-3">
              <span className={cn("size-2 shrink-0 rounded-full", urgencyDot[t.urgency])} aria-hidden />
              <div className="min-w-0 flex-[1_1_13rem]">
                <p className="text-sm font-medium text-ink-900">{t.title}</p>
                <p className="text-[13px] text-ink-500">{t.detail}</p>
              </div>
              <Link href={t.href} className={buttonStyles({ size: "sm", className: "h-[38px] shrink-0 text-[13px] whitespace-nowrap" })}>{t.action}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-[18px] py-7 text-center">
          <p className="text-[15px] font-semibold text-navy-950">All caught up</p>
          <p className="text-[13px] text-ink-500">Nothing needs doing right now.</p>
        </div>
      )}
    </Card>
  );
}

export function TodayList({ arrivals, departures, today, canAct }: Movements) {
  const rows = [...arrivals.map((r) => ({ r, arriving: true })), ...departures.map((r) => ({ r, arriving: false }))];
  return (
    <Card>
      <CardHeader title="Today" description="Arrivals and departures, with the next step for each guest." />
      {rows.length ? (
        <ul className="divide-y divide-hairline">
          {rows.map(({ r, arriving }) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-[18px] py-3">
              <span className={cn("w-[68px] text-[11px] font-semibold tracking-[0.08em] uppercase", arriving ? "text-info-700" : "text-gold-600")}>{arriving ? "Arriving" : "Leaving"}</span>
              <div className="min-w-0 flex-[1_1_13rem]">
                <Link href={href(r)} className="text-sm font-medium text-ink-900 hover:text-navy-700">{r.guestName}</Link>
                <p className={cn("text-[13px]", !r.roomNumber || balanceOf(r) > 0 ? "text-warning-700" : "text-ink-500")}>
                  {r.category} · {roomText(r)} · {plural(nightsBetween(r.checkIn, r.checkOut), "night")} · {paymentText(r)}
                </p>
              </div>
              {canAct ? <NextStep r={r} today={today} href={href(r)} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-[18px] py-7 text-center text-sm text-ink-500">No arrivals or departures today.</p>
      )}
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" aria-busy className="space-y-5 px-4 py-5 lg:px-8 lg:py-7">
      <div className="h-28 rounded-card bg-navy-950/90" />
      <div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-8 w-32 !rounded-full" />)}</div>
      <Card className="divide-y divide-hairline">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-[18px] py-3.5">
            <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-1/2" /><div className="skeleton h-2.5 w-1/3" /></div>
            <div className="skeleton h-[38px] w-28" />
          </div>
        ))}
      </Card>
    </div>
  );
}
