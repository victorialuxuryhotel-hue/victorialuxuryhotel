import { Sparkles, User, Wrench } from "lucide-react";
import { roomBoardState, type RoomBoardState } from "@/domain/status";
import type { RoomTile } from "@/domain/views";
import { cn } from "@/lib/utils/cn";
import { ReadinessBadge } from "./badges";
import { RoomSelection, RoomTile as InteractiveTile } from "./room-tile";

export const roomStateColour: Record<RoomBoardState, string> = {
  occupied: "bg-navy-700",
  arriving: "bg-info-700",
  available: "bg-success-600",
  dirty: "bg-warning-600",
  maintenance: "bg-danger-600",
};

const Dot = ({ state }: { state: RoomBoardState }) => <span className={cn("size-2 shrink-0 rounded-full", roomStateColour[state])} aria-hidden />;

export function RoomBoardLegend({ rooms, stacked }: { rooms: RoomTile[]; stacked?: boolean }) {
  return (
    <ul className={cn("flex text-sm", stacked ? "flex-col gap-2" : "flex-wrap gap-x-5 gap-y-2")}>
      {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => (
        <li key={s} className="flex items-center gap-2.5 text-ink-600">
          <Dot state={s} />
          <span className={stacked ? "flex-1" : undefined}>{roomBoardState[s].label}</span>
          <span className="font-semibold tabular-nums text-ink-900">{rooms.filter((r) => r.state === s).length}</span>
        </li>
      ))}
    </ul>
  );
}

export function RoomStateChips({ rooms, active, hrefFor }: { rooms: RoomTile[]; active?: RoomBoardState; hrefFor: (s?: RoomBoardState) => string }) {
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap tabular-nums",
      on ? "border-navy-950 bg-navy-950 text-white" : "border-hairline bg-white text-ink-700 hover:border-ink-300",
    );
  return (
    <nav aria-label="Filter rooms" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      <a href={hrefFor()} aria-current={!active ? "page" : undefined} className={chip(!active)}>All rooms <span className="opacity-75">{rooms.length}</span></a>
      {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => {
        const n = rooms.filter((r) => r.state === s).length;
        return n ? (
          <a key={s} href={hrefFor(s)} aria-current={active === s ? "page" : undefined} className={chip(active === s)}>
            <Dot state={s} />{roomBoardState[s].label} <span className="opacity-75">{n}</span>
          </a>
        ) : null;
      })}
    </nav>
  );
}

export function RoomBoard({ rooms, interactive = true }: { rooms: Array<RoomTile & { serviceStatus?: string }>; interactive?: boolean }) {
  const floors = [...new Set(rooms.map((r) => r.floor ?? "—"))];
  return (
    <RoomSelection>
    <div className="space-y-6">
      {floors.map((floor) => (
        <section key={floor} aria-labelledby={`floor-${floor}`}>
          <h3 id={`floor-${floor}`} className="mb-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-500">
            Floor {floor}
          </h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
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
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-700"><Dot state={r.state} />{roomBoardState[r.state].label}</p>
                        <div className="mt-2 flex min-h-5 min-w-0 items-center gap-1.5 text-xs text-ink-500">
                          {r.state === "maintenance" ? (
                            <>
                              <Wrench className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{r.note ?? "Out of service"}</span>
                            </>
                          ) : r.guestName ? (
                            <>
                              <User className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate">{r.guestName}</span>
                            </>
                          ) : r.readiness !== "ready" && !(r.state === "dirty" && r.readiness === "needs_cleaning") ? (
                            <>
                              <Sparkles className="size-3.5 shrink-0" aria-hidden /> <ReadinessBadge readiness={r.readiness} />
                            </>
                          ) : null}
                        </div>
                      </>
                    );
                    const tileClass = "flex h-full min-h-[76px] w-full min-w-0 flex-col rounded-xl border border-hairline bg-white px-3 py-2.5 text-left transition-shadow hover:shadow-card";
                    return interactive ? (
                      <InteractiveTile
                        key={`${r.state}-${r.readiness}-${r.serviceStatus ?? ""}`}
                        className={tileClass}
                        stateLabel={`${roomBoardState[r.state].label}${r.readiness !== "ready" && r.state !== "maintenance" ? ` · ${r.readiness.replace(/_/g, " ")}` : ""}`}
                        room={{ id: r.id, number: r.number, category: r.category, readiness: r.readiness, maintenance: r.serviceStatus === "maintenance" || r.state === "maintenance", note: r.note }}
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
    </RoomSelection>
  );
}
