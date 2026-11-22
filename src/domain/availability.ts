import { addDays } from "@/lib/hotel-date";
import type { AvailabilityOption } from "./views";

/**
 * The nearest check-in date (within `withinDays` either side of the one asked
 * for, never before today) where a room type is free for the same number of
 * nights. `free` maps a date to whether at least one room is free that night;
 * a date missing from the map counts as not free. Later dates win ties, since
 * guests more often push a trip back than bring it forward.
 */
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

/**
 * How room types are shown for a search: types that fit the party and are
 * free (cheapest first), then those that fit but are full, then (separately)
 * the ones too small for the party.
 */
export function groupOptions(options: AvailabilityOption[], guests: number) {
  const byPrice = (a: AvailabilityOption, b: AvailabilityOption) => a.totalKobo - b.totalKobo;
  const fitting = options.filter((o) => o.maxOccupancy >= guests);
  return {
    available: fitting.filter((o) => o.isAvailable).sort(byPrice),
    full: fitting.filter((o) => !o.isAvailable).sort(byPrice),
    tooSmall: options.filter((o) => o.maxOccupancy < guests).sort(byPrice),
  };
}
