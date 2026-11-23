export function localDigits(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("234") && d.length >= 10) d = `0${d.slice(3)}`; // local numbers start with 0, never 234
  return d;
}

export function phoneMatches(stored: string | null | undefined, typed: string): boolean {
  const all = localDigits(typed);
  if (all.length < 7) return false; // 7 digits as typed, leading 0 included
  const t = all.replace(/^0/, "");
  return localDigits(stored).includes(t);
}
