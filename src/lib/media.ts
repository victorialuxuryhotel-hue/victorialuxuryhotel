/**
 * Hotel photos live in the PHOTOS R2 bucket and are served by our own route,
 * /media/<key> (src/app/media/[...key]/route.ts). Keys contain a random id,
 * so a replaced photo gets a new URL and can be cached forever.
 *
 *   rooms/<room-type-id>/<uuid>.<ext>    photos of a room type
 *   site/<place>/<uuid>.<ext>            website photos (hero, pool, gallery…)
 */
export const mediaUrl = (key: string) => `/media/${key}`;

export const roomPhotoKey = (categoryId: string, ext: string) => `rooms/${categoryId}/${crypto.randomUUID()}.${ext}`;
export const sitePhotoKey = (slot: string, ext: string) => `site/${slot}/${crypto.randomUUID()}.${ext}`;

/** Only keys we generate are served (no path tricks). */
export const isMediaKey = (key: string) => /^(rooms\/[0-9a-f-]{36}|site\/[a-z]+)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key);
