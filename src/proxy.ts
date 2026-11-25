import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

export const proxy = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  if (impossibleLink(path)) return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  if (path === "/app" || path.startsWith("/app/") || path.startsWith("/two-step")) {
    const { userId } = await auth();
    if (!userId) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }
});

export const config = {
  matcher: ["/app/:path*", "/login", "/auth/:path*", "/two-step/:path*", "/rooms/:slug", "/book/review/:path*", "/book/confirmation/:path*"],
};
