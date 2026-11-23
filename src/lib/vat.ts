export function vatIncluded(grossKobo: number, rateBp: number): number {
  return Math.round((grossKobo * rateBp) / (10_000 + rateBp));
}
