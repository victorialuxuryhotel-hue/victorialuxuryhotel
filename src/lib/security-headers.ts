const CLERK = "https://*.clerk.accounts.dev https://*.clerk.com https://clerk.victorialuxuryhotel.com";
const CLERK_IMG = "https://img.clerk.com https://*.clerk.com https://*.clerk.accounts.dev";
const TURNSTILE = "https://challenges.cloudflare.com";
const PAYSTACK = "https://checkout.paystack.com https://api.paystack.co https://standard.paystack.co";
const CF_ANALYTICS = "https://static.cloudflareinsights.com";
const MAPS = "https://www.google.com https://maps.google.com https://maps.googleapis.com";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `form-action 'self' ${PAYSTACK}`,
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${CLERK} ${TURNSTILE} ${CF_ANALYTICS}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${CLERK_IMG}`,
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK} https://*.clerk.com:* https://api.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://cloudflareinsights.com ${TURNSTILE} ${PAYSTACK}`,
  `frame-src ${MAPS} ${CLERK} ${TURNSTILE} ${PAYSTACK}`,
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

export const BASE_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
];

export const HSTS = "max-age=63072000; includeSubDomains; preload";

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
