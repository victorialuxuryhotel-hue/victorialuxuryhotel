import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/**
 * How Next.js caching maps onto Cloudflare:
 *  - Cached pages and "use cache" data live in R2.
 *  - Cache tags live in D1, which is strongly consistent: when staff change a
 *    room type or photo (updateTag("catalogue")), the website reflects it on
 *    the next request. (The KV alternative can lag by up to 60 s.)
 *  - Background refreshes of time-based cache entries use the in-memory queue,
 *    which is sufficient for a single hotel's traffic.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  queue: memoryQueue,
});
