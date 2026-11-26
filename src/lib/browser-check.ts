// Hardware brief H8: the system is built for current Chrome on Windows 10/11. Warn (never block)
// when a computer falls short, so problems are fixed before they look like bugs.

/** Oldest Chrome / Edge major version the system is tested against. */
export const MIN_CHROMIUM = 120;

export const TOO_OLD = "This computer's browser is too old for the system. Use Google Chrome on Windows 10 or 11.";

/** The warning for this user agent, or null when it's a current Chromium browser on a supported system. */
export function browserProblem(ua: string): string | null {
  if (/Windows NT (5\.|6\.[0-3])/.test(ua)) return TOO_OLD; // XP, Vista, 7, 8, 8.1
  const chromium = /(?:Chrome|CriOS|Edg)\/(\d+)/.exec(ua);
  if (!chromium || /OPR\/|SamsungBrowser/.test(ua)) return TOO_OLD;
  if (Number(chromium[1]) < MIN_CHROMIUM) return TOO_OLD;
  return null;
}
