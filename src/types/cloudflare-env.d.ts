// Bindings the Worker gets from wrangler.jsonc. Kept by hand (not generated)
// so the types don't depend on whoever ran `wrangler types` and what was in
// their local env files. Runtime types (D1Database, R2Bucket…) come from
// /cloudflare-env.d.ts (`pnpm cf:typegen`).
interface CloudflareEnv {
  /** The hotel database (migrations/*.sql). */
  DB: D1Database;
  /** Hotel photos, served by /media/[...key]. */
  PHOTOS: R2Bucket;
  IMAGES: ImagesBinding;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  CRON_SECRET?: string;
}
