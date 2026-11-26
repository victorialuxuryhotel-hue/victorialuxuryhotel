import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { NextUp, ToDo, TodayList, dashboardTasks } from "@/components/management/dashboard";
import { PageHeader } from "@/components/management/page-header";
import { RoomBoardLegend, roomStateColour } from "@/components/management/room-board";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { reservations, rooms } from "../_sample";

export default function Page() {
  const today = "2026-12-01";
  const arrivals = reservations.filter((r) => r.checkIn === today && r.status !== "cancelled");
  const departures = reservations.filter((r) => r.checkOut === today && r.status === "checked_in");
  const inHouse = reservations.filter((r) => r.status === "checked_in");
  const attention = reservations.filter((r) => r.attention);
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Tuesday 1 December 2026"
        actions={<Link href="/preview/app/reservations/new" className={buttonStyles({ className: "size-11 px-0 sm:size-auto sm:px-4" })} aria-label="New reservation"><CalendarPlus className="size-4" aria-hidden /><span className="hidden sm:inline">New reservation</span></Link>}
      />
      <div className="space-y-5 px-4 py-5 lg:px-8 lg:py-7">
        <NextUp arrivals={arrivals} departures={departures} today={today} canAct />
        <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
          <ToDo tasks={dashboardTasks({ attention, arrivals, inHouse, rooms })} />
          <Card>
            <CardHeader title="Rooms right now" action={<Link href="/preview/app/rooms" className="text-[13px] font-medium text-navy-800">Room board</Link>} />
            <div className="px-[18px] py-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-ivory-200">
                {(["occupied", "arriving", "available", "dirty", "maintenance"] as const).map((s) => (
                  <div key={s} className={roomStateColour[s]} style={{ width: `${(rooms.filter((r) => r.state === s).length / rooms.length) * 100}%` }} />
                ))}
              </div>
              <div className="mt-3.5"><RoomBoardLegend rooms={rooms} stacked /></div>
            </div>
          </Card>
        </div>
        <TodayList arrivals={arrivals} departures={departures} today={today} canAct />
      </div>
    </>
  );
}
