/** Places on the home page's "On site" cards: each holds up to CARD_PHOTOS photos, split in one frame. */
export const CARD_SLOTS = ["pool", "lounge", "restaurant", "club"] as const;
export const CARD_PHOTOS = 4;
export const isCardSlot = (slot: string) => (CARD_SLOTS as readonly string[]).includes(slot);

export const photoSlots = [
  { slot: "hero", label: "Homepage hero", where: "Full-width banner at the top of the homepage", shape: "Landscape, 16:9 or wider", shot: "Arrival at golden hour: the façade glowing warm against a deep-blue sky, entrance lit, a hint of welcome inside." },
  { slot: "welcome", label: "Homepage welcome", where: "Beside the welcome text on the homepage", shape: "Portrait, 4:5", shot: "Reception or lounge, warm and welcoming, staff greeting a guest (out of focus)." },
  { slot: "pool", label: "Indoor pool", where: "Homepage On site card (up to 4 photos, shown together) and Facilities page", shape: "Landscape, 4:3", shot: "A still, glassy pool in soft light; folded towels and a cold drink on a lounger." },
  { slot: "lounge", label: "Lounge", where: "Homepage On site card (up to 4 photos, shown together)", shape: "Landscape, 4:3", shot: "The lounge seating, warm light, a guest relaxing with a drink." },
  { slot: "restaurant", label: "Restaurant", where: "Homepage On site card (up to 4 photos, shown together) and the gallery", shape: "Landscape, 4:3", shot: "A table laid for dinner, plated dish in focus, room softly behind." },
  { slot: "club", label: "Club", where: "Homepage On site card (up to 4 photos, shown together)", shape: "Landscape, 4:3", shot: "The club in the evening: lights, music, guests out of focus, indoor and outdoor." },
  { slot: "spa", label: "Spa", where: "Facilities page", shape: "Portrait 4:5 (also used 16:10)", shot: "Warm low light, steam, scrub bowl, folded linen, a hand resting. Feels like exhaling." },
  { slot: "bar", label: "Bar", where: "Facilities page", shape: "Portrait 4:5 (also used 16:10)", shot: "Evening glow, a cocktail being poured, guests laughing out of focus." },
  { slot: "exterior", label: "Hotel exterior", where: "About page", shape: "Portrait, 3:4", shot: "The entrance and façade in daylight, clean and inviting." },
  { slot: "reception", label: "Reception", where: "About page", shape: "Portrait, 3:4", shot: "The reception desk, warm light, flowers, a welcoming team member." },
  { slot: "conference", label: "Conference room", where: "Gallery and future events pages", shape: "Landscape, 4:3", shot: "Set for a meeting: water, notepads, natural light, screen on." },
  { slot: "about", label: "About page feature", where: "Spare feature photo for the About page", shape: "Landscape, 3:2", shot: "A detail that says 'royalty': gold accents, textures, considered styling." },
] as const;


export const galleryGroups = ["Rooms", "Pool & spa", "Dining", "The hotel"] as const;
