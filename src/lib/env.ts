import { z } from "zod";

/**
 * Public environment. NEXT_PUBLIC_* values are inlined at build time, so each
 * one must be referenced statically (process.env.NAME), never dynamically.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${z.prettifyError(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}
