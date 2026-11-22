/** Formatting for amounts (stored as integer kobo) and hotel-local dates. */

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export function formatNaira(kobo: number): string {
  return naira.format(kobo / 100);
}

const TZ = "Africa/Lagos";

/** "Tue 1 Dec 2026" from an ISO date (YYYY-MM-DD), without timezone drift. */
export function formatDate(isoDate: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: opts.weekday === false ? undefined : "short",
    day: "numeric",
    month: "short",
    year: opts.year === false ? undefined : "numeric",
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

/** "Four" for 4; digits above ten, where words get clumsy. */
export function numberWord(n: number): string {
  return words[n] ?? String(n);
}

/**
 * A guest-facing room label, e.g. "Room 204 · Floor 2". Floors are stored as
 * text ("2", or a name like "Ground"); numbers get the word "Floor".
 */
export function roomLabel(roomNumber: string, floor?: string | null): string {
  const f = floor?.trim();
  if (!f) return `Room ${roomNumber}`;
  return `Room ${roomNumber} · ${/^\d+$/.test(f) ? `Floor ${f}` : /floor/i.test(f) ? f : `${f} floor`}`;
}

/** Guest-facing copy from the database, minus unfinished drafts ("[Placeholder] …", "[Sample] …"). */
export function publicText(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  return t.startsWith("[") ? "" : t;
}
