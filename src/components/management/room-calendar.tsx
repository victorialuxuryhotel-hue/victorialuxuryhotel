import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { toneClasses } from "@/components/ui/badge";
import { BAR, type Bar, type BarKind, type TypeBlock } from "@/domain/calendar";
import { cn } from "@/lib/utils/cn";

const COLS = "grid grid-cols-[6.5rem_repeat(14,minmax(0,1fr))] xl:grid-cols-[8rem_repeat(14,minmax(0,1fr))]";

function dayHead(d: string) {
  const at = new Date(`${d}T12:00:00Z`);
  return {
    weekday: at.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    day: at.getUTCDate(),
    month: at.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    weekend: [0, 6].includes(at.getUTCDay()),
  };
}

export type CalendarLinks = {
  /** A booking bar: the side panel (I7). */
  booking: (b: Bar) => string;
  /** An empty cell: New booking with the type, date and (if any) room. */
  newBooking: (typeId: string, date: string, roomId: string | null) => string;
  shift: (days: number) => string;
  today: string;
};

/** Interface brief I6, version 1: read-only. Moves and extensions happen from the booking side panel. */
export function RoomCalendar({ days, blocks, today, firstBookable, links }: { days: string[]; blocks: TypeBlock[]; today: string; firstBookable: string; links: CalendarLinks }) {
  const heads = days.map(dayHead);
  const first = heads[0]!;
  const last = heads.at(-1)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={links.shift(-7)} className={buttonStyles({ variant: "secondary", size: "sm" })}><ChevronLeft className="size-4" aria-hidden />7 days</Link>
          <Link href={links.today} className={buttonStyles({ variant: "secondary", size: "sm" })}>Today</Link>
          <Link href={links.shift(7)} className={buttonStyles({ variant: "secondary", size: "sm" })}>7 days<ChevronRight className="size-4" aria-hidden /></Link>
        </div>
        <p className="text-sm text-ink-600">{first.day} {first.month} – {last.day} {last.month}</p>
        <ul className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600" aria-label="Legend">
          {(Object.keys(BAR) as BarKind[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5"><span aria-hidden className={cn("h-3 w-4 rounded-[2px] border-l-[3px] border-current", toneClasses[BAR[k].tone])} />{BAR[k].label}</li>
          ))}
          <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-[2px] bg-[repeating-linear-gradient(135deg,var(--color-ivory-200)_0_3px,var(--color-ivory-50)_3px_6px)] ring-1 ring-hairline" />Out of order</li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-card border border-hairline bg-ivory-50" data-calendar="">
        <div className="min-w-[56rem]">
          <div className={cn(COLS, "sticky top-0 z-20 border-b border-hairline bg-ivory-50")}>
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Room</div>
            {days.map((d, i) => (
              <div key={d} className={cn("border-l border-hairline px-1 py-1.5 text-center leading-tight", heads[i]!.weekend && "bg-ivory-100", d === today && "bg-gold-50")}>
                <span className="block text-[11px] uppercase tracking-wide text-ink-500">{heads[i]!.weekday}</span>
                <span className={cn("block text-sm tabular-nums", d === today ? "font-semibold text-navy-900" : "text-ink-800")}>{heads[i]!.day}</span>
              </div>
            ))}
          </div>

          {blocks.map((b) => (
            <section key={b.type.id} aria-label={b.type.name} data-type={b.type.id}>
              <div className={cn(COLS, "border-b border-hairline bg-ivory-100/70")}>
                <div className="truncate px-3 py-1.5 text-sm font-medium text-ink-900">{b.type.name}</div>
                {b.free.map((n, i) => (
                  <div key={days[i]} data-free={n} className={cn("border-l border-hairline py-1.5 text-center text-xs tabular-nums", n <= 0 ? "text-danger-700" : "text-ink-600")} title={`${b.type.name}: ${Math.max(0, n)} free${n < 0 ? ` (overbooked by ${-n})` : ""}`}>
                    {n < 0 ? `−${-n}` : n === 0 ? "Full" : `${n} free`}
                  </div>
                ))}
              </div>
              {b.lanes.map((lane) => (
                <div key={lane.key} className={cn(COLS, "relative border-b border-hairline last:border-b-0")} data-lane={lane.roomId ?? "unassigned"}>
                  <div style={{ gridColumn: 1, gridRow: 1 }} className={cn("truncate px-3 py-2 text-sm", lane.roomId ? "text-ink-800" : "italic text-ink-500")}>{lane.roomId ? `Room ${lane.label}` : lane.label}</div>
                  {days.map((d, i) =>
                    lane.outOfOrder || d < firstBookable ? (
                      <div key={d} style={{ gridColumn: i + 2, gridRow: 1 }} className={cn("min-h-10 border-l border-hairline", heads[i]!.weekend && "bg-ivory-100/60")} />
                    ) : (
                      <Link
                        key={d}
                        style={{ gridColumn: i + 2, gridRow: 1 }}
                        href={links.newBooking(b.type.id, d, lane.roomId)}
                        aria-label={`New ${b.type.name} booking from ${heads[i]!.weekday} ${heads[i]!.day} ${heads[i]!.month}${lane.roomId ? `, Room ${lane.label}` : ""}`}
                        className={cn("min-h-10 border-l border-hairline hover:bg-navy-50/60 focus-visible:bg-navy-50", heads[i]!.weekend && "bg-ivory-100/60")}
                      />
                    ),
                  )}
                  {lane.outOfOrder ? (
                    <div
                      style={{ gridColumn: `2 / span ${days.length}`, gridRow: 1 }}
                      className="pointer-events-none z-10 m-1 flex items-center truncate rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--color-ivory-200)_0_6px,var(--color-ivory-50)_6px_12px)] px-2 text-xs text-ink-600 ring-1 ring-hairline"
                    >
                      Out of order{lane.note ? ` · ${lane.note}` : ""}
                    </div>
                  ) : null}
                  {lane.bars.map((bar) => (
                    <Link
                      key={bar.stay.id}
                      href={links.booking(bar)}
                      scroll={false}
                      data-bar={bar.kind}
                      data-reference={bar.stay.reference}
                      title={`${bar.stay.guestName} · ${bar.stay.reference} · ${BAR[bar.kind].label}`}
                      style={{ gridColumn: `${bar.start + 2} / span ${bar.span}`, gridRow: 1 }}
                      className={cn(
                        "z-10 my-1 flex min-w-0 items-center truncate px-2 text-xs font-medium shadow-[0_0_0_1px_rgb(0_0_0/0.06)] hover:brightness-95",
                        "border-l-[3px] border-current",
                        toneClasses[BAR[bar.kind].tone],
                        bar.cutStart ? "ml-0 rounded-l-none" : "ml-1 rounded-l-[4px]",
                        bar.cutEnd ? "mr-0 rounded-r-none" : "mr-1 rounded-r-[4px]",
                      )}
                    >
                      <span className="truncate">{bar.label}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
