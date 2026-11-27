import type { LucideIcon } from "lucide-react";
import {
  Car,
  Plane,
  ShowerHead,
  Sparkles,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wine,
  Zap,
  Presentation,
  Music,
} from "lucide-react";

export type Photo = { image?: string; alt: string; shot?: string };

export const home = {
  eyebrow: "Alagbaka GRA · Akure",
  title: "Where every guest is treated as royalty",
  intro:
    "An exclusive indoor pool, an in-house spa and a relaxed lounge and bar, in the heart of Alagbaka GRA. Book direct for instant confirmation.",
  facts: "Indoor pool, in-house spa, lounge and bar. 24/7 power and free Wi-Fi.",
  hero: {
    alt: "Victoria Luxury Hotel at dusk",
    shot: "Arrival at golden hour: the façade glowing warm against a deep-blue sky, entrance lit, a hint of welcome inside.",
  } satisfies Photo,
};

export const highlights: Array<{ title: string; text: string; icon: LucideIcon } & Photo> = [
  {
    title: "Exclusive indoor pool",
    text: "Swim in comfort, rain or shine, in a pool reserved for our guests.",
    icon: Waves,
    alt: "Indoor swimming pool",
    shot: "A still, glassy pool in soft light; folded towels and a cold drink on a lounger. Calm, private, inviting.",
  },
  {
    title: "In-house spa",
    text: "Ease into the heated room, then finish with a body scrub.",
    icon: Sparkles,
    alt: "Spa",
    shot: "Close detail of the spa ritual: warm low light, steam, scrub bowl, folded linen, a hand resting. Feels like exhaling.",
  },
  {
    title: "Lounge & bar",
    text: "An evening drink, an easy meeting, or a quiet moment to yourself.",
    icon: Wine,
    alt: "Lounge and bar",
    shot: "Evening at the bar: warm pendant light, a cocktail being poured, two guests laughing out of focus. Sociable, relaxed.",
  },
];

/** The home page's On site cards (client, 2026-11-27). Photos come from the place of the same name in Website photos. */
export const onSite: Array<{ slot: "pool" | "lounge" | "restaurant" | "club"; title: string; text: string; alt: string }> = [
  { slot: "pool", title: "Exclusive indoor pool", text: "Swim in comfort, rain or shine, in a pool reserved for our guests.", alt: "Indoor swimming pool" },
  { slot: "lounge", title: "Lounge", text: "An evening drink, an easy meeting, or a quiet moment to yourself.", alt: "The lounge" },
  { slot: "restaurant", title: "Restaurant", text: "Dining on site for breakfast, lunch and dinner.", alt: "The restaurant" },
  { slot: "club", title: "Club", text: "Indoor and outdoor lounge for the evening.", alt: "The club" },
];

export const facilities: Array<{ name: string; text: string; icon: LucideIcon }> = [
  { name: "Restaurant", text: "Dining on site for breakfast, lunch and dinner.", icon: UtensilsCrossed },
  { name: "Lounge & bar", text: "Drinks and conversation in a relaxed lounge.", icon: Wine },
  { name: "Club", text: "Indoor and outdoor lounge.", icon: Music },
  { name: "Indoor swimming pool", text: "An exclusive indoor pool for hotel guests.", icon: Waves },
  { name: "Spa", text: "Heated room and body scrub treatments in house.", icon: Sparkles },
  { name: "Conference room", text: "A room for meetings, trainings and corporate events.", icon: Presentation },
  { name: "Free Wi-Fi", text: "Complimentary internet access for every guest.", icon: Wifi },
  { name: "Parking", text: "On-site parking for guests.", icon: Car },
  { name: "Laundry", text: "Laundry service for short and long stays.", icon: ShowerHead },
  { name: "24/7 power", text: "Uninterrupted electricity, day and night.", icon: Zap },
  { name: "Airport shuttle", text: "Airport transfers. Ask the front desk to arrange.", icon: Plane },
];

export const guestTypes = [
  { title: "Business travellers", text: "Reliable power, Wi-Fi and a conference room for work on the road." },
  { title: "Long stays", text: "Apartments and laundry service for guests staying weeks, not nights." },
  { title: "Couples & leisure", text: "The pool, spa and lounge for a restful break." },
  { title: "Families", text: "Space to settle in, with dining and parking on site." },
  { title: "Corporate groups & events", text: "Accommodation and a conference room in one place." },
  { title: "Visitors to Akure", text: "A calm base in Alagbaka GRA, with airport transfers available." },
];

export type CategoryContent = { slug: string; name: string; summary: string } & Photo;

export const categories: CategoryContent[] = [
  { slug: "standard", name: "Standard", summary: "Comfortable, well-appointed rooms for a restful stay.", alt: "Standard room", shot: "Morning light across a crisply made bed, breakfast tray, curtains half open. Fresh, restful, good value." },
  { slug: "deluxe", name: "Deluxe", summary: "More room to relax, for guests who want a little extra.", alt: "Deluxe room", shot: "Late afternoon: robe on the bed, slippers, book and a coffee by the window seat. A little extra indulgence." },
  { slug: "suite", name: "Suite", summary: "Generous space for a stay that feels truly special.", alt: "Suite", shot: "The living area from the doorway, lamps on, flowers on the table, bedroom glimpsed beyond. Space to spread out." },
  { slug: "apartment", name: "Apartment", summary: "Self-contained living for families and long stays.", alt: "Apartment", shot: "Family life: kitchen set for a meal, sitting area with cushions and throws. Feels like a home, with hotel service." },
];

export const gallery: Array<{ group: string } & Photo> = [
  { group: "Rooms", alt: "Standard room", shot: "Morning light across a crisply made bed, breakfast tray, curtains half open. Fresh, restful, good value." },
  { group: "Rooms", alt: "Deluxe room", shot: "Late afternoon: robe on the bed, slippers, book and a coffee by the window seat. A little extra indulgence." },
  { group: "Rooms", alt: "Suite", shot: "The living area from the doorway, lamps on, flowers on the table, bedroom glimpsed beyond. Space to spread out." },
  { group: "Rooms", alt: "Apartment", shot: "Family life: kitchen set for a meal, sitting area with cushions and throws. Feels like a home, with hotel service." },
  { group: "Pool & spa", alt: "Indoor pool" },
  { group: "Pool & spa", alt: "Spa heated room" },
  { group: "Dining", alt: "Restaurant" },
  { group: "Dining", alt: "Lounge and bar" },
  { group: "The hotel", alt: "Hotel exterior" },
  { group: "The hotel", alt: "Reception" },
  { group: "The hotel", alt: "Conference room" },
  { group: "The hotel", alt: "Grounds" },
];
