/** The VAT inside a VAT-inclusive amount, e.g. ₦107,500 at 7.5% (750 basis points) includes ₦7,500. */
export function vatIncluded(grossKobo: number, rateBp: number): number {
  return Math.round((grossKobo * rateBp) / (10_000 + rateBp));
}
