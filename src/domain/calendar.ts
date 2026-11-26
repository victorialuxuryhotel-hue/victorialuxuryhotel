// Room calendar (interface brief I6): rooms down the side grouped by type, 14 nights across. Pure
// layout, so the placing of bars is unit-tested; the data comes from server/domain/calendar.ts.

import type { Tone } from "@/components/ui/badge";
import { addDays, nightsBetween } from "@/lib/hotel-date";
import { surname } from "./room-board";

export type CalType = { id: string; name: string };
export type CalRoom = { id: string; number: string; categoryId: string; outOfOrder: boolean; note: string | null };
export type CalStay = {
  id: string;
  reference: string;
  guestName: string;
  roomId: string | null;
  /** The type of the room they're in (or booked, before a room is assigned). */
  categoryId: string;
  checkIn: string;
  checkOut: string;
  /** When the stay stops holding a room: an overstaying guest runs to at least tomorrow (inventory.ts stayEndSql). */
  end: string;
  status: "pending_payment" | "confirmed" | "checked_in";
};

export type BarKind = "awaiting" | "confirmed" | "in_house" | "due_out" | "overdue";
/** Existing badge tones only (brief: no new colours). */
export const BAR: Record<BarKind, { label: string; tone: Tone }> = {
  awaiting: { label: "Awaiting payment", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "brand" },
  in_house: { label: "In house", tone: "success" },
  due_out: { label: "Due out today", tone: "info" },
  overdue: { label: "Overdue", tone: "danger" },
};

export function barKind(s: Pick<CalStay, "status" | "checkOut">, today: string): BarKind {
  if (s.status === "pending_payment") return "awaiting";
  if (s.status === "confirmed") return "confirmed";
  if (s.checkOut < today) return "overdue";
  return s.checkOut === today ? "due_out" : "in_house";
}

export type Bar = {
  stay: CalStay;
  kind: BarKind;
  /** First column (0-based) and how many nights it covers inside the window. */
  start: number;
  span: number;
  /** Runs on before / after the window. */
  cutStart: boolean;
  cutEnd: boolean;
  label: string;
};

export type Lane = { key: string; label: string; roomId: string | null; outOfOrder: boolean; note: string | null; bars: Bar[] };
export type TypeBlock = { type: CalType; free: number[]; lanes: Lane[] };

export function placeBar(stay: CalStay, from: string, days: number, today: string): Bar | null {
  const start = nightsBetween(from, stay.checkIn);
  const end = nightsBetween(from, stay.end);
  if (end <= 0 || start >= days) return null;
  const s = Math.max(0, start);
  const e = Math.min(days, end);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  return { stay, kind: barKind(stay, today), start: s, span: e - s, cutStart: start < 0, cutEnd: end > days, label: `${surname(stay.guestName)} · ${nights}n` };
}

/** Bookings without a room yet, packed into as few rows as possible (earliest first). */
export function packLanes(bars: Bar[]): Bar[][] {
  const lanes: Bar[][] = [];
  for (const b of [...bars].sort((a, c) => a.start - c.start || c.span - a.span)) {
    const lane = lanes.find((l) => l.every((x) => x.start + x.span <= b.start || b.start + b.span <= x.start));
    if (lane) lane.push(b);
    else lanes.push([b]);
  }
  return lanes;
}

export function calendarLayout(v: {
  from: string;
  days: number;
  today: string;
  types: CalType[];
  rooms: CalRoom[];
  stays: CalStay[];
  /** categoryId → date → free (the shared definition; negative = overbooked). */
  free: Map<string, Map<string, number>>;
}): { days: string[]; blocks: TypeBlock[] } {
  const days = Array.from({ length: v.days }, (_, i) => addDays(v.from, i));
  const bars = v.stays.map((s) => placeBar(s, v.from, v.days, v.today)).filter((b): b is Bar => b !== null);
  const blocks = v.types.map((type) => {
    const lanes: Lane[] = v.rooms
      .filter((r) => r.categoryId === type.id)
      .map((r) => ({ key: r.id, label: r.number, roomId: r.id, outOfOrder: r.outOfOrder, note: r.note, bars: bars.filter((b) => b.stay.roomId === r.id) }));
    const unassigned = bars.filter((b) => b.stay.roomId === null && b.stay.categoryId === type.id);
    packLanes(unassigned).forEach((l, i) => lanes.push({ key: `${type.id}-unassigned-${i}`, label: "No room yet", roomId: null, outOfOrder: false, note: null, bars: l }));
    return { type, free: days.map((d) => v.free.get(type.id)?.get(d) ?? 0), lanes };
  });
  return { days, blocks };
}
