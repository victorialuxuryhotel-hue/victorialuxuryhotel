export const photoSlots = [
  { slot: "hero", label: "Homepage hero", where: "Full-width banner at the top of the homepage", shape: "Landscape, 16:9 or wider", shot: "Arrival at golden hour: the façade glowing warm against a deep-blue sky, entrance lit, a hint of welcome inside." },
  { slot: "welcome", label: "Homepage welcome", where: "Beside the welcome text on the homepage", shape: "Portrait, 4:5", shot: "Reception or lounge, warm and welcoming, staff greeting a guest (out of focus)." },
  { slot: "pool", label: "Indoor pool", where: "Homepage experiences and Facilities page", shape: "Portrait 4:5 (also used 16:10)", shot: "A still, glassy pool in soft light; folded towels and a cold drink on a lounger." },
  { slot: "spa", label: "Spa", where: "Homepage experiences and Facilities page", shape: "Portrait 4:5 (also used 16:10)", shot: "Warm low light, steam, scrub bowl, folded linen, a hand resting. Feels like exhaling." },
  { slot: "bar", label: "Lounge & bar", where: "Homepage experiences and Facilities page", shape: "Portrait 4:5 (also used 16:10)", shot: "Evening glow, a cocktail being poured, guests laughing out of focus." },
  { slot: "exterior", label: "Hotel exterior", where: "About page", shape: "Portrait, 3:4", shot: "The entrance and façade in daylight, clean and inviting." },
  { slot: "reception", label: "Reception", where: "About page", shape: "Portrait, 3:4", shot: "The reception desk, warm light, flowers, a welcoming team member." },
  { slot: "restaurant", label: "Restaurant", where: "Gallery and future dining pages", shape: "Landscape, 4:3", shot: "A table laid for dinner, plated dish in focus, room softly behind." },
  { slot: "conference", label: "Conference room", where: "Gallery and future events pages", shape: "Landscape, 4:3", shot: "Set for a meeting: water, notepads, natural light, screen on." },
  { slot: "about", label: "About page feature", where: "Spare feature photo for the About page", shape: "Landscape, 3:2", shot: "A detail that says 'royalty': gold accents, textures, considered styling." },
] as const;


export const galleryGroups = ["Rooms", "Pool & spa", "Dining", "The hotel"] as const;
