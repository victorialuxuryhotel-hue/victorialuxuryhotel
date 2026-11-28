import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Links that can't exist by their shape get a real 404 before rendering starts (once the page
 * streams, the status is already 200; Next then adds noindex instead). No database lookups here:
 * Proxy runs in front of the app.
 */
function impossibleLink(path: string): boolean {
  const room = /^\/rooms\/([^/]+)\/?$/.exec(path);
  if (room) return !SLUG.test(decodeURIComponent(room[1]!)) || room[1]!.length > 80;
  const booking = /^\/book\/(?:review|confirmation)\/([^/]+)/.exec(path);
  if (booking) return !UUID.test(booking[1]!);
  return false;
}

/** The staff app's own paths. With APP_HOST set they live on the app address (app.victorialuxuryhotel.com). */
const STAFF = /^\/(?:app|login|station|two-step|auth)(?:\/|$)/;

/**
 * Staff on their own address (APP_HOST, live only): the main site's staff paths move there with the same path and
 * query, and the app address's front page opens the staff app. Unset (staging, local), nothing changes.
 */
export function staffAddress(request: NextRequest): NextResponse | null {
  const appHost = process.env.APP_HOST;
  if (!appHost) return null;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  // Only on the hotel's own addresses: localhost, staging and workers.dev are left alone even if APP_HOST is set.
  const apex = appHost.split(".").slice(1).join(".");
  if (host !== appHost && host !== apex && host !== `www.${apex}`) return null;
  const path = request.nextUrl.pathname;
  if (host === appHost) return path === "/" ? NextResponse.redirect(new URL("/app", request.url)) : null;
  if (STAFF.test(path)) {
    const to = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${appHost}`);
    return NextResponse.redirect(to, 308);
  }
  return null;
}

export const proxy = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  const moved = staffAddress(request);
  if (moved) return moved;
  if (impossibleLink(path)) return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  if (path === "/app" || path.startsWith("/app/") || path.startsWith("/two-step")) {
    const { userId } = await auth();
    // A shared station runs without a Clerk session: the server checks its token and the PIN session (server/auth.ts).
    const station = path.startsWith("/app") && request.cookies.has("vl_station");
    if (!userId && !station) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }
});

export const config = {
  matcher: ["/", "/app/:path*", "/station", "/login", "/auth/:path*", "/two-step/:path*", "/rooms/:slug", "/book/review/:path*", "/book/confirmation/:path*"],
};
