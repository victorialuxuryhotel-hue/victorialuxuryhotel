export type PricedExtra = { priceKobo: number; perNight: boolean };

/** An extra for this many nights: per-night extras are charged every night, the rest once. */
export const extraCost = (e: PricedExtra, nights: number) => e.priceKobo * (e.perNight ? nights : 1);

/**
 * What a stay costs: the room at the nightly rate, plus extras, less a promo on the room only.
 * The booking form and the server both use this, so the guest never sees one total and pays another.
 */
export function stayPrice(v: { nightlyRateKobo: number; nights: number; extras?: PricedExtra[]; discountPct?: number }) {
  const roomKobo = v.nightlyRateKobo * v.nights;
  const extrasKobo = (v.extras ?? []).reduce((sum, e) => sum + extraCost(e, v.nights), 0);
  const discountKobo = Math.round((roomKobo * (v.discountPct ?? 0)) / 100);
  return { roomKobo, extrasKobo, discountKobo, totalKobo: roomKobo + extrasKobo - discountKobo };
}
