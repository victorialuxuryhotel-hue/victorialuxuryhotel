import { Sparkles, User, Wrench } from "lucide-react";
import { roomBoardState, type RoomBoardState } from "@/domain/status";
import type { RoomTile } from "@/domain/views";
import { cn } from "@/lib/utils/cn";
import { ReadinessBadge } from "./badges";
import { RoomQuickActions } from "./room-actions";

const accent: Record<RoomBoardState, string> = {
  occupied: "border-l-navy-700",
  arriving: "border-l-info-700",
  available: "border-l-success-600",
  dirty: "border-l-warning-600",
  maintenance: "border-l-danger-600",
};

/** Count of rooms in each state, as a legend that doubles as a summary. */
export function RoomBoardLegend({ rooms }: { rooms: RoomTile[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => (
        <li key={s} className="flex items-center gap-2 text-ink-600">
          <span className={cn("h-3 w-1 rounded-full border-l-4", accent[s])} aria-hidden />
          {roomBoardState[s].label}
          <span className="font-semibold tabular-nums text-ink-900">{rooms.filter((r) => r.state === s).length}</span>
        </li>
      ))}
    </ul>
  );
}

/** Every room at a glance, grouped by floor. Tiles open the room's quick actions. */
export function RoomBoard({ rooms, interactive = true }: { rooms: Array<RoomTile & { serviceStatus?: string }>; interactive?: boolean }) {
  const floors = [...new Set(rooms.map((r) => r.floor ?? "—"))];
  return (
    <div className="space-y-8">
      {floors.map((floor) => (
        <section key={floor} aria-labelledby={`floor-${floor}`}>
          <h3 id={`floor-${floor}`} className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
            Floor {floor}
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {rooms
              .filter((r) => (r.floor ?? "—") === floor)
              .map((r) => (
                <li key={r.id}>
                  <details className="group relative h-full">
                  <summary
                    className={cn(
                      "flex h-full w-full cursor-pointer list-none flex-col rounded-md border border-l-4 border-ivory-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md group-open:ring-2 group-open:ring-navy-600/30",
                      accent[r.state],
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-semibold tabular-nums text-ink-900">{r.number}</span>
                      <span className="text-xs text-ink-500">{r.category}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-ink-700">{roomBoardState[r.state].label}</p>
                    <div className="mt-3 flex min-h-5 items-center gap-1.5 text-xs text-ink-500">
                      {r.state === "maintenance" ? (
                        <>
                          <Wrench className="size-3.5" aria-hidden /> {r.note ?? "Out of service"}
                        </>
                      ) : r.guestName ? (
                        <>
                          <User className="size-3.5" aria-hidden />
                          <span className="truncate">{r.guestName}</span>
                        </>
                      ) : r.readiness !== "ready" ? (
                        <>
                          <Sparkles className="size-3.5" aria-hidden /> <ReadinessBadge readiness={r.readiness} />
                        </>
                      ) : null}
                    </div>
                  </summary>
                  {interactive ? (
                    <div className="absolute top-full left-0 z-20 mt-1 w-60 rounded-card border border-ivory-200 bg-white p-3 shadow-lg">
                      <p className="mb-2 text-xs font-semibold text-ink-500">Room {r.number}</p>
                      <RoomQuickActions roomId={r.id} readiness={r.readiness} maintenance={r.serviceStatus === "maintenance" || r.state === "maintenance"} />
                    </div>
                  ) : null}
                  </details>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
