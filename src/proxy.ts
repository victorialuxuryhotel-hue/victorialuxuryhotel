import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Runs before staff routes to keep the Clerk session fresh and to send
 * signed-out visitors from /app to the sign-in page.
 *
 * This is NOT the authorization layer. Every management page, server action
 * and staff query re-checks the staff member and role (src/server/auth.ts),
 * and every business function checks the role again at the data layer.
 */
const isManagement = createRouteMatcher(["/app(.*)"]);

export const proxy = clerkMiddleware(async (auth, request) => {
  if (isManagement(request)) {
    const { userId } = await auth();
    if (!userId) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", request.nextUrl.pathname);
      return Response.redirect(url);
    }
  }
});

export const config = {
  // Only routes that use the staff session. The public website, booking and
  // payment routes and webhooks skip it entirely.
  matcher: ["/app/:path*", "/login", "/auth/:path*"],
};
