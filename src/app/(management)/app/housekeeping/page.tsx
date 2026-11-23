import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { ActionButton } from "@/components/management/action-form";
import { PageHeader } from "@/components/management/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { actorOf, authorizeRead, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { cleaningList } from "@/server/domain/housekeeping";
import { markTidied, updateRoomStatus } from "@/server/rooms";

export const metadata: Metadata = { title: "Housekeeping" };

const time = (iso: string) => formatDateTime(iso).split(", ").pop();

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "rooms.status")) return <AccessDenied />;
  const reader = await authorizeRead("rooms.status");
  const { toClean, stayOvers, doneToday } = await cleaningList(await getDb(), actorOf(reader));
  const toTidy = stayOvers.filter((s) => !s.tidiedAt);
  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <Card>
        <CardHeader title={`To clean (${toClean.length})`} description="Guest arriving today: clean these first." />
        {toClean.length ? (
          <ul className="divide-y divide-hairline">
            {toClean.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold tabular-nums text-ink-900">
                    Room {r.number}
                    {r.arrivingToday ? <span className="ml-2 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">Guest arriving today</span> : null}
                  </p>
                  <p className="text-sm text-ink-600">
                    {r.category}{r.floor ? ` · Floor ${r.floor}` : ""} · {r.readiness === "cleaning_in_progress" ? "Being cleaned" : "Not started"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.readiness === "needs_cleaning" ? (
                    <ActionButton action={updateRoomStatus} fields={{ roomId: r.id, readiness: "cleaning_in_progress" }} variant="secondary">Start</ActionButton>
                  ) : null}
                  <ActionButton action={updateRoomStatus} fields={{ roomId: r.id, readiness: "ready" }}>Done</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-sm text-ink-500">All rooms are clean.</p>}
      </Card>

      <Card>
        <CardHeader title={toTidy.length ? `Daily tidy (${toTidy.length} left)` : "Daily tidy"} description="Rooms with a guest staying." />
        {stayOvers.length ? (
          <ul className="divide-y divide-hairline">
            {stayOvers.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold tabular-nums text-ink-900">Room {r.number}</p>
                  <p className="truncate text-sm text-ink-600">{r.guest} · {r.category}</p>
                </div>
                {r.tidiedAt ? (
                  <span className="text-sm text-success-700">Tidied {time(r.tidiedAt)}</span>
                ) : (
                  <ActionButton action={markTidied} fields={{ roomId: r.id }} variant="secondary">Tidied</ActionButton>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-sm text-ink-500">No guests staying.</p>}
      </Card>

      <Card>
        <CardHeader title="Done today" />
        {doneToday.length ? (
          <ul className="divide-y divide-hairline">
            {doneToday.map((d, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 text-ink-900">Room {d.room} {d.what}</span>
                <span className="text-xs text-ink-500">{d.who ? `${d.who} · ` : ""}{time(d.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-sm text-ink-500">Nothing yet today.</p>}
      </Card>
    </div>
  );
}

export default function HousekeepingPage() {
  return (
    <>
      <PageHeader title="Housekeeping" description="Today's cleaning list." />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
