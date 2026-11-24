import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const proxy = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
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
  matcher: ["/app/:path*", "/login", "/auth/:path*", "/two-step/:path*"],
};
