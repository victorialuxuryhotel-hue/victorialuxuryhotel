import { Sparkles, User, Wrench } from "lucide-react";
import { roomBoardState, type RoomBoardState } from "@/domain/status";
import type { RoomTile } from "@/domain/views";
import { surname } from "@/domain/room-board";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { ReadinessBadge } from "./badges";
import { RoomTile as InteractiveTile } from "./room-tile";

const accent: Record<RoomBoardState, string> = {
  occupied: "border-l-navy-700",
  arriving: "border-l-info-700",
  available: "border-l-success-600",
  dirty: "border-l-warning-600",
  maintenance: "border-l-danger-600",
};

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

export function RoomStateChips({ rooms, active, hrefFor }: { rooms: RoomTile[]; active?: RoomBoardState; hrefFor: (s?: RoomBoardState) => string }) {
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap tabular-nums",
      on ? "border-navy-800 bg-navy-800 text-white" : "border-ink-300 bg-ivory-50 text-ink-700",
    );
  return (
    <nav aria-label="Filter rooms" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      <a href={hrefFor()} aria-current={!active ? "page" : undefined} className={chip(!active)}>All {rooms.length}</a>
      {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => {
        const n = rooms.filter((r) => r.state === s).length;
        return n ? (
          <a key={s} href={hrefFor(s)} aria-current={active === s ? "page" : undefined} className={chip(active === s)}>
            {roomBoardState[s].label} {n}
          </a>
        ) : null;
      })}
    </nav>
  );
}

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
                  {(() => {
                    const body = (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-lg font-semibold tabular-nums text-ink-900">{r.number}</span>
                          <span className="truncate text-xs text-ink-500">{r.category}</span>
                        </div>
                        <p className={cn("mt-1 text-xs font-medium", r.due === "overdue" ? "text-danger-700" : "text-ink-700")}>
                          {r.due === "overdue" && r.until ? `Overdue since ${formatDate(r.until, { year: false })}` : r.due === "today" ? "Due out today" : roomBoardState[r.state].label}
                        </p>
                        <div className="mt-2 flex min-h-5 min-w-0 items-center gap-1.5 text-xs text-ink-500">
                          {r.state === "maintenance" ? (
                            <>
                              <Wrench className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{r.note ?? "Out of service"}</span>
                            </>
                          ) : r.guestName ? (
                            <>
                              <User className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate" title={r.guestName}>{surname(r.guestName)}</span>
                            </>
                          ) : r.readiness !== "ready" ? (
                            <>
                              <Sparkles className="size-3.5 shrink-0" aria-hidden /> <ReadinessBadge readiness={r.readiness} />
                            </>
                          ) : null}
                        </div>
                      </>
                    );
                    const tileClass = cn(
                      "flex h-full min-h-[76px] w-full min-w-0 flex-col rounded-md border border-l-4 border-hairline bg-ivory-50 p-3 text-left shadow-sm transition-shadow hover:shadow-md",
                      accent[r.state],
                    );
                    return interactive ? (
                      <InteractiveTile
                        key={`${r.state}-${r.readiness}-${r.serviceStatus ?? ""}`}
                        className={tileClass}
                        stateLabel={`${roomBoardState[r.state].label}${r.readiness !== "ready" && r.state !== "maintenance" ? ` · ${r.readiness.replace(/_/g, " ")}` : ""}`}
                        room={{ id: r.id, number: r.number, category: r.category, readiness: r.readiness, maintenance: r.serviceStatus === "maintenance" || r.state === "maintenance" }}
                      >
                        {body}
                      </InteractiveTile>
                    ) : (
                      <div className={tileClass}>{body}</div>
                    );
                  })()}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
