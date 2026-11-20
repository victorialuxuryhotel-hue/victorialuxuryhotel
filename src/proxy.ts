import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs before matched requests to:
 *  1. Refresh the Supabase auth session cookie (Server Components can't write cookies).
 *  2. Optimistically redirect signed-out visitors away from /app.
 *
 * This is NOT the authorization layer. Every management page, server action and
 * route handler re-checks the staff member and role on the server, and RLS
 * enforces access in the database.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // getClaims() validates the JWT and refreshes it if expired. Do not put code
  // between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && (pathname === "/app" || pathname.startsWith("/app/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Only routes that need the session refreshed: the management app and the
  // auth callback. Public pages, /login (the sign-in action sets its own
  // cookies) and webhooks skip the proxy entirely.
  matcher: ["/app/:path*", "/auth/:path*"],
};
