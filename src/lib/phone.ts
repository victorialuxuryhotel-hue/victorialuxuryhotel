/**
 * Nigerian-style local digits for matching phone numbers typed in any format:
 * "+234 803 412 7781", "2348034127781" and "0803-412-7781" all become
 * "08034127781". Other countries keep their digits.
 */
export function localDigits(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("234") && d.length >= 10) d = `0${d.slice(3)}`; // local numbers start with 0, never 234
  return d;
}

/** True when what's been typed (7+ digits) is part of the stored number. */
export function phoneMatches(stored: string | null | undefined, typed: string): boolean {
  const all = localDigits(typed);
  if (all.length < 7) return false; // 7 digits as typed, leading 0 included
  const t = all.replace(/^0/, "");
  return localDigits(stored).includes(t);
}
