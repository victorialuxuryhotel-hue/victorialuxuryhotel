import { hotel } from "@/config/hotel";
import { facilities } from "@/content/site";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://victorialuxuryhotel.com";
export const ALTERNATE_NAMES = ["Victoria Luxury Hotel and Apartments", "Victoria Luxury Hotel", "Victoria Luxury Hotel Akure"];

export type RoomFact = { slug: string; name: string; summary: string; maxOccupancy: number; fromRateKobo: number };
export type Times = { checkInTime: string; checkOutTime: string };

const naira = (kobo: number) => Math.round(kobo / 100);
const hhmm = (t: string) => t.slice(0, 5);

export function hotelJsonLd(rooms: RoomFact[], times: Times) {
  const prices = rooms.map((r) => naira(r.fromRateKobo));
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": `${SITE_URL}/#hotel`,
    name: hotel.name,
    alternateName: ALTERNATE_NAMES,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/logo-full.png`,
    image: `${SITE_URL}/brand/logo-full.png`,
    description: `${hotel.name} in Alagbaka GRA, Akure, Ondo State: rooms, suites and apartments with an indoor pool, spa, restaurant, lounge and bar, and a club.`,
    telephone: hotel.phone,
    email: hotel.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: hotel.address.line1,
      addressLocality: hotel.address.city,
      addressRegion: hotel.address.state,
      addressCountry: "NG",
    },
    hasMap: hotel.mapsUrl,
    checkinTime: hhmm(times.checkInTime),
    checkoutTime: hhmm(times.checkOutTime),
    currenciesAccepted: "NGN",
    paymentAccepted: "Card, Bank transfer, Cash",
    ...(prices.length ? { priceRange: `₦${Math.min(...prices).toLocaleString("en-NG")} – ₦${Math.max(...prices).toLocaleString("en-NG")} per night` } : {}),
    amenityFeature: facilities.map((f) => ({ "@type": "LocationFeatureSpecification", name: f.name, value: true })),
    containsPlace: rooms.map((r) => ({
      "@type": "HotelRoom",
      name: r.name,
      url: `${SITE_URL}/rooms/${r.slug}`,
      ...(r.summary ? { description: r.summary } : {}),
      occupancy: { "@type": "QuantitativeValue", maxValue: r.maxOccupancy },
    })),
    makesOffer: rooms.map((r) => ({
      "@type": "Offer",
      name: `${r.name} room`,
      url: `${SITE_URL}/rooms/${r.slug}`,
      priceCurrency: "NGN",
      price: naira(r.fromRateKobo),
      priceSpecification: { "@type": "UnitPriceSpecification", price: naira(r.fromRateKobo), priceCurrency: "NGN", unitText: "night" },
    })),
  };
}

export type Faq = { q: string; a: string };

export function hotelFaqs(times: Times, cancellation: string): Faq[] {
  return [
    { q: "Where is Victoria Luxury Hotel and Apartment?", a: `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}, Nigeria.` },
    { q: "What time are check-in and check-out?", a: `Check-in is from ${hhmm(times.checkInTime)}. Check-out is by ${hhmm(times.checkOutTime)}.` },
    { q: "What facilities does the hotel have?", a: `${facilities.map((f) => f.name).join(", ")}.` },
    { q: "How do I book?", a: `Book and pay online at ${SITE_URL}/book, or call or WhatsApp ${hotel.phoneDisplay}.` },
    { q: "How can I pay?", a: "Online by card or bank transfer (Paystack), or at the front desk by cash, transfer or POS." },
    { q: "What is the cancellation policy?", a: cancellation },
  ];
}

export function faqJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
