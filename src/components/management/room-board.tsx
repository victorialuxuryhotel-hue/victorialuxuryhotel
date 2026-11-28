import { roomBoardState, type RoomBoardState } from "@/domain/status";
import type { RoomTile } from "@/domain/views";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { updateRoomStatus } from "@/server/rooms";
import { ActionButton } from "./action-form";
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

/** Filter chips (design R105): "All · 29", "Ready · 16"… Each is a link, so the filter survives a reload. */
export function RoomStateChips({ rooms, active, hrefFor }: { rooms: RoomTile[]; active?: RoomBoardState; hrefFor: (s?: RoomBoardState) => string }) {
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-[34px] w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap tabular-nums",
      on ? "border-navy-700 bg-[#e8eefb] text-navy-800" : "border-[#cfcabd] bg-white text-ink-900 hover:border-ink-400",
    );
  return (
    <nav aria-label="Filter rooms" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      <a href={hrefFor()} aria-current={!active ? "page" : undefined} className={chip(!active)}>{!active ? <span aria-hidden>✓</span> : null}All · {rooms.length}</a>
      {(Object.keys(roomBoardState) as RoomBoardState[]).map((s) => {
        const n = rooms.filter((r) => r.state === s).length;
        return n ? (
          <a key={s} href={hrefFor(s)} aria-current={active === s ? "page" : undefined} className={chip(active === s)}>
            {active === s ? <span aria-hidden>✓</span> : null}
            {roomBoardState[s].label} · {n}
          </a>
        ) : null;
      })}
    </nav>
  );
}

/** Design R105: a coloured top edge and a badge per state. Arriving has its own violet so it isn't mistaken for occupied. */
const top: Record<RoomBoardState, string> = {
  occupied: "border-t-navy-800",
  arriving: "border-t-[#4b2aa8]",
  available: "border-t-[#166534]",
  dirty: "border-t-[#8a4b06]",
  maintenance: "border-t-[#a61b1b]",
};
const badge: Record<RoomBoardState, string> = {
  occupied: "bg-[#e8eefb] text-navy-800",
  arriving: "bg-[#f1ecff] text-[#4b2aa8]",
  available: "bg-[#e7f6ec] text-[#166534]",
  dirty: "bg-[#fff4dc] text-[#8a4b06]",
  maintenance: "bg-[#fde8e8] text-[#a61b1b]",
};

/** The grey line under the badge: who is in it and when they leave, who is arriving, or what is broken. */
function detail(r: RoomTile): { text: string; urgent?: boolean } | null {
  if (r.state === "maintenance") return { text: r.note ?? "Out of service" };
  if (r.state === "occupied" && r.guestName) {
    if (r.due === "overdue") return { text: `${r.guestName} · overdue`, urgent: true };
    if (r.due === "today") return { text: `${r.guestName} · out today` };
    return { text: r.until ? `${r.guestName} · out ${formatDate(r.until, { year: false })}` : r.guestName };
  }
  if (r.guestName) return { text: r.guestName };
  if (r.readiness === "cleaning_in_progress") return { text: "Being cleaned" };
  return null;
}

export function RoomBoard({ rooms, interactive = true }: { rooms: Array<RoomTile & { serviceStatus?: string }>; interactive?: boolean }) {
  const floors = [...new Set(rooms.map((r) => r.floor ?? "—"))];
  return (
    <div className="space-y-4">
      {floors.map((floor) => (
        <section key={floor} aria-labelledby={`floor-${floor}`} className="flex flex-col gap-2">
          <h3 id={`floor-${floor}`} className="text-[13px] font-semibold tracking-normal text-[#5b6372] uppercase">
            Floor {floor}
          </h3>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {rooms
              .filter((r) => (r.floor ?? "—") === floor)
              .map((r) => {
                const line = detail(r);
                const maintenance = r.serviceStatus === "maintenance" || r.state === "maintenance";
                const body = (
                  <>
                    <span key="head" className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-bold tabular-nums text-ink-900">{r.number}</span>
                      <span className="truncate text-xs text-[#5b6372]">{r.category}</span>
                    </span>
                    <span key="state" className={cn("w-fit rounded-md px-2 py-0.5 text-xs font-semibold", badge[r.state])}>{roomBoardState[r.state].label}</span>
                    <span key="line" className={cn("block truncate text-[13px]", line?.urgent ? "text-[#a61b1b]" : "text-[#5b6372]")} title={line?.text}>{line?.text ?? "\u00a0"}</span>
                  </>
                );
                const box = cn("flex h-full min-h-[118px] w-full min-w-0 flex-col gap-1.5 rounded-[10px] border border-t-4 border-hairline bg-white px-3 py-2.5 text-left", top[r.state]);
                const quick =
                  r.state === "dirty" ? (
                    <ActionButton action={updateRoomStatus} fields={{ roomId: r.id, readiness: "ready" }} size="sm" className="items-start [&_button]:h-8">Mark clean</ActionButton>
                  ) : r.state === "maintenance" ? (
                    <ActionButton action={updateRoomStatus} fields={{ roomId: r.id, serviceStatus: "in_service" }} size="sm" variant="secondary" className="items-start [&_button]:h-8">Back in use</ActionButton>
                  ) : null;
                return (
                  <li key={r.id} id={`room-${r.number}`} className="scroll-mt-24 rounded-[10px] target:ring-2 target:ring-gold-500">
                    {interactive ? (
                      <InteractiveTile
                        key={`${r.state}-${r.readiness}-${r.serviceStatus ?? ""}`}
                        className={box}
                        footer={quick}
                        stateLabel={`${roomBoardState[r.state].label}${r.readiness !== "ready" && r.state !== "maintenance" ? ` · ${r.readiness.replace(/_/g, " ")}` : ""}`}
                        room={{ id: r.id, number: r.number, category: r.category, readiness: r.readiness, maintenance }}
                      >
                        {body}
                      </InteractiveTile>
                    ) : (
                      <div className={box}>{body}</div>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
