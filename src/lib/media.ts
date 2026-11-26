export const mediaUrl = (key: string) => `/media/${key}`;

export const roomPhotoKey = (categoryId: string, ext: string) => `rooms/${categoryId}/${crypto.randomUUID()}.${ext}`;
export const sitePhotoKey = (slot: string, ext: string) => `site/${slot}/${crypto.randomUUID()}.${ext}`;

export const isMediaKey = (key: string) => /^(rooms\/[0-9a-f-]{36}|site\/[a-z]+)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key);

/**
 * Photos from the photo store (/media/…) skip the image optimiser. On Cloudflare (OpenNext) the
 * optimiser only finds local images among the built static files, so it can't read the store and
 * answers "upstream response is invalid". Photos are uploaded web-sized, so they load as they are.
 */
export const fromPhotoStore = (src: unknown) => typeof src === "string" && src.startsWith("/media/");

