import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { BAR, type Bar, type BarKind, type TypeBlock } from "@/domain/calendar";
import { cn } from "@/lib/utils/cn";

/** Literal classes so Tailwind sees them: a 150px room column, then one column per night. */
const COLS: Record<7 | 14, string> = {
  7: "grid grid-cols-[7rem_repeat(7,minmax(0,1fr))] xl:grid-cols-[150px_repeat(7,minmax(0,1fr))]",
  14: "grid grid-cols-[7rem_repeat(14,minmax(0,1fr))] xl:grid-cols-[150px_repeat(14,minmax(0,1fr))]",
};

/** Design R103: Booked (navy), In house (green), Awaiting payment (amber), Overdue (red). Each bar also says it in its title. */
const LOOK: Record<BarKind, { label: string; className: string }> = {
  confirmed: { label: "Booked", className: "border-[#a9bce8] bg-[#e8eefb] text-navy-800" },
  in_house: { label: "In house", className: "border-[#9fd3b2] bg-[#e7f6ec] text-[#166534]" },
  due_out: { label: "In house", className: "border-[#9fd3b2] bg-[#e7f6ec] text-[#166534]" },
  awaiting: { label: "Awaiting payment", className: "border-[#f0c46a] bg-[#fff4dc] text-[#8a4b06]" },
  overdue: { label: "Overdue", className: "border-[#f1b8b8] bg-[#fde8e8] text-[#a61b1b]" },
};
const LEGEND: BarKind[] = ["confirmed", "in_house", "awaiting", "overdue"];

function dayHead(d: string) {
  const at = new Date(`${d}T12:00:00Z`);
  return {
    weekday: at.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    day: at.getUTCDate(),
    month: at.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
  };
}

export type CalendarLinks = {
  /** A booking bar: the side panel (I7). */
  booking: (b: Bar) => string;
  /** An empty cell: New booking with the type, date and (if any) room. */
  newBooking: (typeId: string, date: string, roomId: string | null) => string;
  shift: (days: number) => string;
  today: string;
  /** The same dates shown 7 or 14 nights at a time. */
  nights: (n: 7 | 14) => string;
};

/** Interface brief I6, version 1: read-only. Moves and extensions happen from the booking side panel. */
export function RoomCalendar({ days, blocks, today, firstBookable, links }: { days: string[]; blocks: TypeBlock[]; today: string; firstBookable: string; links: CalendarLinks }) {
  const heads = days.map(dayHead);
  const first = heads[0]!;
  const last = heads.at(-1)!;
  const n = days.length === 7 ? 7 : 14;
  const cols = COLS[n];
  const seg = (v: 7 | 14) => (
    <Link
      href={links.nights(v)}
      aria-current={n === v ? "page" : undefined}
      className={cn(
        "flex h-[34px] flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold whitespace-nowrap",
        n === v ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-[#5b6372] hover:text-ink-900",
      )}
    >
      {v} nights
    </Link>
  );
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <nav aria-label="How many nights" className="flex w-[220px] gap-1 rounded-lg bg-[#eae7df] p-1">
            {seg(7)}
            {seg(14)}
          </nav>
          <p className="text-sm text-[#5b6372]">{first.day} {first.month} – {last.day} {last.month}</p>
        </div>
        <div className="flex gap-2">
          <Link href={links.shift(-n)} className={buttonStyles({ variant: "secondary", size: "sm" })}>← Earlier</Link>
          <Link href={links.today} className={buttonStyles({ variant: "secondary", size: "sm" })}>Today</Link>
          <Link href={links.shift(n)} className={buttonStyles({ variant: "secondary", size: "sm" })}>Later →</Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline bg-white" data-calendar="">
        <div className={n === 14 ? "min-w-[56rem]" : "min-w-[40rem]"}>
          <div className={cn(cols, "sticky top-0 z-20 border-b border-hairline bg-white")}>
            <div className="px-3.5 py-2 text-xs font-semibold text-[#5b6372] uppercase">Room</div>
            {days.map((d, i) => (
              <div key={d} className={cn("px-1 py-2 text-center text-xs font-semibold whitespace-nowrap tabular-nums", d === today ? "bg-[#e8eefb] text-ink-900" : "text-[#5b6372]")}>
                {heads[i]!.weekday} {heads[i]!.day}
              </div>
            ))}
          </div>

          {blocks.map((b) => (
            <section key={b.type.id} aria-label={b.type.name} data-type={b.type.id}>
              <div className={cn(cols, "border-b border-[#f1eee8] bg-ivory-100/60")}>
                <div className="truncate px-3.5 py-1.5 text-[13px] font-semibold text-ink-900">{b.type.name}</div>
                {b.free.map((f, i) => (
                  <div key={days[i]} data-free={f} className={cn("py-1.5 text-center text-xs tabular-nums", f <= 0 ? "font-semibold text-[#a61b1b]" : "text-[#5b6372]")} title={`${b.type.name}: ${Math.max(0, f)} free${f < 0 ? ` (overbooked by ${-f})` : ""}`}>
                    {f < 0 ? `−${-f}` : f === 0 ? "Full" : `${f} free`}
                  </div>
                ))}
              </div>
              {b.lanes.map((lane) => (
                <div key={lane.key} className={cn(cols, "relative min-h-[42px] border-b border-[#f1eee8] last:border-b-0")} data-lane={lane.roomId ?? "unassigned"}>
                  <div style={{ gridColumn: 1, gridRow: 1 }} className="flex min-w-0 items-center gap-2 px-3.5 text-sm">
                    {lane.roomId ? (
                      <>
                        <b className="tabular-nums">{lane.label}</b>
                        <span className="truncate text-xs text-[#5b6372]">{b.type.name}</span>
                      </>
                    ) : (
                      <span className="truncate text-xs text-[#8a4b06] italic">{lane.label}</span>
                    )}
                  </div>
                  {days.map((d, i) =>
                    // No new booking where it couldn't be made: out of order, before the first bookable night, or the type is
                    // already full that night (an overdue guest can hold the capacity while a room looks empty).
                    lane.outOfOrder || d < firstBookable || (b.free[i] ?? 1) <= 0 ? (
                      <div key={d} title={(b.free[i] ?? 1) <= 0 ? `${b.type.name} is full this night` : undefined} style={{ gridColumn: i + 2, gridRow: 1 }} className={cn("min-h-[42px] border-l border-[#f1eee8]", d === today && "bg-[#f7f9fe]")} />
                    ) : (
                      <Link
                        key={d}
                        style={{ gridColumn: i + 2, gridRow: 1 }}
                        href={links.newBooking(b.type.id, d, lane.roomId)}
                        aria-label={`New ${b.type.name} booking from ${heads[i]!.weekday} ${heads[i]!.day} ${heads[i]!.month}${lane.roomId ? `, Room ${lane.label}` : ""}`}
                        className={cn("min-h-[42px] border-l border-[#f1eee8] hover:bg-navy-50/60 focus-visible:bg-navy-50", d === today && "bg-[#f7f9fe]")}
                      />
                    ),
                  )}
                  {lane.outOfOrder ? (
                    <div
                      style={{ gridColumn: `2 / span ${days.length}`, gridRow: 1 }}
                      className="pointer-events-none z-10 mx-1 my-1.5 flex items-center truncate rounded-md border border-[#f1b8b8] bg-[repeating-linear-gradient(135deg,#fdf1f1_0_6px,#fff_6px_12px)] px-2 text-[13px] font-semibold text-[#a61b1b]"
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
                        "z-10 my-1.5 flex h-[30px] min-w-0 items-center truncate border px-2 text-[13px] font-semibold hover:brightness-95",
                        LOOK[bar.kind].className,
                        bar.cutStart ? "ml-0 rounded-l-none" : "ml-[3px] rounded-l-md",
                        bar.cutEnd ? "mr-0 rounded-r-none" : "mr-[3px] rounded-r-md",
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

      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-[#5b6372]" aria-label="Legend">
        {LEGEND.map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span aria-hidden className={cn("size-3 rounded-[3px] border", LOOK[k].className)} />{LOOK[k].label}</li>
        ))}
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-[3px] border border-[#f1b8b8] bg-[repeating-linear-gradient(135deg,#fde8e8_0_2px,#fff_2px_4px)]" />Out of order</li>
        <li>Tap an empty night to book it</li>
      </ul>
    </div>
  );
}
