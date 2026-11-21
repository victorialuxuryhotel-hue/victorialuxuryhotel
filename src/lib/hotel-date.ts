/**
 * Hotel-local calendar dates ('YYYY-MM-DD'). Arrivals, departures and daily
 * summaries follow Africa/Lagos time, not UTC, so nothing shifts at midnight UTC.
 */
const HOTEL_TZ = "Africa/Lagos";

export function hotelToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOTEL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The hotel-local date of an instant (ISO timestamp). */
export function hotelDateOf(iso: string): string {
  return hotelToday(new Date(iso));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole nights between two dates (check-out minus check-in). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/** Hotel-local wall-clock time now, 'HH:MM:SS'. */
export function hotelTimeNow(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: HOTEL_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(at);
}

/** UTC instant for a hotel-local date and time (Lagos is UTC+1 all year). */
export function hotelInstant(date: string, time: string): string {
  return new Date(`${date}T${time}+01:00`).toISOString();
}
