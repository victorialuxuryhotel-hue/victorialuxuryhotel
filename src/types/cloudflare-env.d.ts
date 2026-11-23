interface CloudflareEnv {
  DB: D1Database;
  PHOTOS: R2Bucket;
  IMAGES: ImagesBinding;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  CRON_SECRET?: string;
}
