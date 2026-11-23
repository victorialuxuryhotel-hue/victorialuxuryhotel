export const mediaUrl = (key: string) => `/media/${key}`;

export const roomPhotoKey = (categoryId: string, ext: string) => `rooms/${categoryId}/${crypto.randomUUID()}.${ext}`;
export const sitePhotoKey = (slot: string, ext: string) => `site/${slot}/${crypto.randomUUID()}.${ext}`;

export const isMediaKey = (key: string) => /^(rooms\/[0-9a-f-]{36}|site\/[a-z]+)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key);
