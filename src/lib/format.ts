const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export function formatNaira(kobo: number): string {
  return naira.format(kobo / 100);
}

const TZ = "Africa/Lagos";

/**
 * "Thu 26 Nov 2026". year: false drops the year; year: "2026" (the current year, passed in by the page
 * so nothing reads the clock while rendering) drops it only for dates in that year: "Fri 28 Jan 2027".
 */
export function formatDate(isoDate: string, opts: { weekday?: boolean; year?: boolean | string } = {}): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const showYear = opts.year === undefined || opts.year === true || (typeof opts.year === "string" && isoDate.slice(0, 4) !== opts.year);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: opts.weekday === false ? undefined : "short",
    day: "numeric",
    month: "short",
    year: showYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(d);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function numberWord(n: number): string {
  return words[n] ?? String(n);
}

export function roomLabel(roomNumber: string, floor?: string | null): string {
  const f = floor?.trim();
  if (!f) return `Room ${roomNumber}`;
  return `Room ${roomNumber} · ${/^\d+$/.test(f) ? `Floor ${f}` : /floor/i.test(f) ? f : `${f} floor`}`;
}

export function publicText(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  return t.startsWith("[") ? "" : t;
}
