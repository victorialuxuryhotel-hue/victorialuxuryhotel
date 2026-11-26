// Initials avatars for guests (interface brief I11): "GA" for Grace Adeyemi, in one of a few neutral
// palette tones, always the same tone for the same name so a guest is easy to spot again.

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => /\p{L}/u.test(p));
  if (!parts.length) return "?";
  const first = parts[0]!.match(/\p{L}/u)![0];
  const last = parts.length > 1 ? parts.at(-1)!.match(/\p{L}/u)![0] : "";
  return (first + last).toUpperCase();
}

/** Neutral tones only: ivory, navy and gold tints from the palette (no saturated colours). */
export const AVATAR_TONES = ["bg-ivory-200 text-ink-700", "bg-navy-50 text-navy-800", "bg-gold-100 text-gold-800", "bg-navy-100 text-navy-900", "bg-gold-50 text-gold-900"] as const;

export function avatarTone(name: string): (typeof AVATAR_TONES)[number] {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}
