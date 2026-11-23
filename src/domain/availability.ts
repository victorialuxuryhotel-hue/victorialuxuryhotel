import { addDays } from "@/lib/hotel-date";
import type { AvailabilityOption } from "./views";

export function nearestFreeStart(
  free: ReadonlyMap<string, boolean>,
  checkIn: string,
  nights: number,
  today: string,
  withinDays = 14,
): string | null {
  const fits = (start: string) => Array.from({ length: nights }, (_, i) => addDays(start, i)).every((d) => free.get(d) === true);
  for (let offset = 1; offset <= withinDays; offset++) {
    for (const start of [addDays(checkIn, offset), addDays(checkIn, -offset)]) {
      if (start >= today && fits(start)) return start;
    }
  }
  return null;
}

export function groupOptions(options: AvailabilityOption[], guests: number) {
  const byPrice = (a: AvailabilityOption, b: AvailabilityOption) => a.totalKobo - b.totalKobo;
  const fitting = options.filter((o) => o.maxOccupancy >= guests);
  return {
    available: fitting.filter((o) => o.isAvailable).sort(byPrice),
    full: fitting.filter((o) => !o.isAvailable).sort(byPrice),
    tooSmall: options.filter((o) => o.maxOccupancy < guests).sort(byPrice),
  };
}
