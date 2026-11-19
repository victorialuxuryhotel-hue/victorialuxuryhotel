# Photography brief: Victoria Luxury Hotel and Apartment

For the hotel's photographer and whoever styles the rooms on the day.

## The idea

Guests don't book rooms; they book how a stay will **feel**. Every photo should
let a visitor imagine themselves there: waking slowly, swimming in calm water,
unwinding in the spa, an easy evening at the bar. Shoot it like an interior-decor
magazine crossed with a lifestyle story: considered, warm, lived-in, never empty
or clinical.

The hotel's promise is that **every guest is treated as royalty**. Images should
feel generous, cared-for and calm.

## Principles

1. **Show a moment, not a room.** A made bed is a fact; a breakfast tray on that
   bed in morning light is an experience.
2. **Light is the mood.** Natural window light for rooms (morning or late
   afternoon). Warm, low practical lighting for the spa and bar at dusk. No
   on-camera flash.
3. **Style like a decorator.** Before each shot: straighten linens, plump and
   chop cushions, hide cables and remotes, remove clutter, add one living detail
   (fresh flowers, a book, a cup of coffee, a folded robe). Less is more.
4. **Echo the brand.** The logo is royal blue and gold. Look for those tones in
   the space (gold fixtures, blue textiles, warm wood) and let them recur.
   Avoid colour casts that fight them (green fluorescent, cold blue LEDs).
5. **People, lightly.** Guests can appear as partial or out-of-focus figures (a
   hand, a back, a silhouette by the pool) so viewers project themselves in.
   Anyone recognisable needs a **signed model release**.
6. **Details sell quality.** For every wide shot, take two or three close-ups:
   fabric texture, a gold tap, folded towels, the spa scrub bowl, a cocktail
   being poured.
7. **Honest, always.** Photograph the real hotel as it is on a good day. No
   staging that misrepresents size, view or facilities, and no AI-generated or
   stock imagery presented as the hotel.

## Shot list (each one fills a place on the website)

| # | Website place | Experience to capture | Shape |
| --- | --- | --- | --- |
| 1 | Home hero (full width) | Arrival at golden hour: the façade glowing warm against a deep-blue sky, entrance lit | Landscape 16:9, plus a 4:5 crop for phones |
| 2 | Home welcome | Reception or lounge, warm and welcoming, staff greeting a guest (out of focus) | Portrait 4:5 |
| 3 | Standard | Morning light across a crisply made bed, breakfast tray, curtains half open | 4:5 and 4:3 |
| 4 | Deluxe | Robe on the bed, slippers, book and coffee by the window | 4:5 and 4:3 |
| 5 | Suite | Living area from the doorway, lamps on, flowers, bedroom glimpsed beyond | 4:5 and 4:3 |
| 6 | Apartment | Kitchen set for a meal, sitting area with cushions and throws | 4:5 and 4:3 |
| 7 | Indoor pool | Still, glassy water, folded towels and a cold drink on a lounger | 4:5 and 16:10 |
| 8 | Spa | Warm low light, steam, scrub bowl, folded linen, a resting hand | 4:5 and 16:10 |
| 9 | Lounge & bar | Evening glow, cocktail being poured, guests laughing out of focus | 4:5 and 16:10 |
| 10 | Restaurant | Table laid for dinner, plated dish in focus, room softly behind | 4:3 |
| 11 | Conference room | Set for a meeting: water, notepads, natural light, screen on | 4:3 |
| 12 | Exterior & grounds | Entrance, parking, gardens in daylight | 3:2 |
| 13 | Gallery extras | 10–20 detail shots across all spaces (textures, gold accents, towels, plants) | Mixed |

The `shot` notes in [`src/content/site.ts`](../src/content/site.ts) mirror this
list, so each image's purpose stays next to where it is used.

## Practical checklist

- **Timing:** rooms in the morning, exterior at golden hour and dusk, spa and bar
  in the evening. Allow a full day.
- **Lens:** avoid extreme wide-angle distortion that makes rooms look bigger
  than they are; shoot at chest height, verticals straight.
- **Housekeeping on set:** one person dedicated to styling and resetting rooms.
- **Release forms** for any recognisable staff or guests.

## Delivery

- JPEG, sRGB, longest side **at least 2400 px**, unwatermarked, with full rights
  for web and marketing use.
- Name files by shot number: `03-standard-bed-morning.jpg`.
- Include the photographer's credit line if required.

Photos are uploaded through the management app (Room categories → Photos, coming
with the public-website phase) or placed in `public/photos/` and referenced from
`src/content/site.ts`. Every page is already laid out for these shapes, so no
redesign is needed when they arrive.

## Uploading (for hotel staff)

- **Room types:** Management → Rooms → Categories & rates → choose a room type →
  Photos. The first photo is the cover; reorder, change the cover, edit the
  description or delete at any time.
- **Everything else:** Management → Settings → Website photos. Each place shows
  the shot it needs and its shape; uploading replaces the current photo. The
  Gallery section takes any number of photos, by section.
- JPEG, PNG or WebP, up to 5 MB each. Every photo needs a short description,
  which is read aloud to visitors using screen readers.
- Changes appear on the website immediately and are recorded in the activity log.
