import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * How Next.js caching maps onto Cloudflare.
 *
 * The app does not use Next's data cache or on-demand revalidation:
 *  - public pages read room types and photos per request,
 *  - management pages are dynamic and server actions call refresh().
 * The only cached output is what `next build` prerenders (page shells), so a
 * read-only cache served from the Worker's static assets is enough. No R2
 * bucket, tag cache or revalidation queue is needed.
 *
 * If "use cache", revalidatePath/revalidateTag or ISR are ever introduced,
 * switch to the R2 incremental cache plus the D1 tag cache
 * (see docs/deployment-cloudflare.md, "If caching is added later").
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
