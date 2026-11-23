/**
 * Browser security headers applied to every Worker response.
 *
 * CSP allows Clerk (staff sign-in), Cloudflare Turnstile (Clerk), Google Maps
 * embed, and Paystack checkout redirects. Next.js and Clerk both need
 * 'unsafe-inline' for styles/scripts today; tighten further once nonces are
 * wired through OpenNext.
 */

const CLERK = "https://*.clerk.accounts.dev https://*.clerk.com https://clerk.victorialuxuryhotel.com";
const CLERK_IMG = "https://img.clerk.com https://*.clerk.com https://*.clerk.accounts.dev";
const TURNSTILE = "https://challenges.cloudflare.com";
const PAYSTACK = "https://checkout.paystack.com https://api.paystack.co https://standard.paystack.co";
const MAPS = "https://www.google.com https://maps.google.com https://maps.googleapis.com";

/** Content-Security-Policy value (single line). */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `form-action 'self' ${PAYSTACK}`,
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${CLERK} ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${CLERK_IMG}`,
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK} https://api.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com ${TURNSTILE} ${PAYSTACK}`,
  `frame-src ${MAPS} ${CLERK} ${TURNSTILE} ${PAYSTACK}`,
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

/** Headers set on every response (HSTS is added only for https:). */
export const BASE_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"],
  // Isolates the browsing context; do not set CORP same-origin — public
  // /media and /brand URLs must stay fetchable by Maps, WhatsApp previews, etc.
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
];

export const HSTS = "max-age=63072000; includeSubDomains; preload";

/** Copy a response and attach security headers (streaming body preserved). */
export function withSecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("x-powered-by");
  for (const [name, value] of BASE_SECURITY_HEADERS) headers.set(name, value);
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", HSTS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
