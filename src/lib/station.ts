// "This station": settings for the computer the app is running on (hardware brief H5). Kept in
// the browser only (localStorage), never on the server: the bar terminal and the front desk differ.

export type PrintLayout = "80mm" | "a4" | "none";
export type StationSettings = {
  /** Till only: which counter opens first. null = the till's own default. */
  counter: "restaurant" | "bar" | null;
  /** How receipts and bills print here. */
  printLayout: PrintLayout;
  /** Print the receipt as soon as a payment is recorded (once per receipt). */
  autoPrint: boolean;
};

export const STATION_KEY = "victoria-station";

/** Defaults: A4 and no automatic printing (front desk, laptops). The bar sets 80mm, which turns auto-print on. */
export const stationDefaults: StationSettings = { counter: null, printLayout: "a4", autoPrint: false };

/** Reads saved settings, ignoring anything unrecognised. Auto-print defaults to on for 80mm unless it was switched off. */
export function parseStation(raw: string | null): StationSettings {
  if (!raw) return stationDefaults;
  try {
    const v = JSON.parse(raw) as Partial<StationSettings>;
    const printLayout: PrintLayout = v.printLayout === "80mm" || v.printLayout === "a4" || v.printLayout === "none" ? v.printLayout : stationDefaults.printLayout;
    return {
      counter: v.counter === "restaurant" || v.counter === "bar" ? v.counter : null,
      printLayout,
      autoPrint: printLayout === "none" ? false : typeof v.autoPrint === "boolean" ? v.autoPrint : printLayout === "80mm",
    };
  } catch {
    return stationDefaults;
  }
}

/**
 * Whether to print this receipt now: only when auto-print is on, a layout is set, and this receipt
 * hasn't been printed by this screen already (so a re-render or a retried request never prints twice).
 */
export function shouldAutoPrint(s: StationSettings, receiptNumber: string | null | undefined, alreadyPrinted: ReadonlySet<string>): boolean {
  return Boolean(s.autoPrint && s.printLayout !== "none" && receiptNumber && !alreadyPrinted.has(receiptNumber));
}

// ---- Browser storage (every read and write survives storage being blocked) ----

const listeners = new Set<() => void>();

export function subscribeStation(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readStationRaw(): string | null {
  try {
    return window.localStorage.getItem(STATION_KEY);
  } catch {
    return null;
  }
}

export function saveStation(s: StationSettings) {
  try {
    window.localStorage.setItem(STATION_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings last until the page closes */
  }
  listeners.forEach((l) => l());
}

/** Printed more than 10 minutes after the money was taken: a reprint, so the document says COPY. */
export const isReprint = (paidAt: string | null | undefined, printedAt: string) =>
  Boolean(paidAt) && Date.parse(printedAt) - Date.parse(paidAt!) > 10 * 60_000;
