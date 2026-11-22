/**
 * Guest session token: the guest's email + expiry, signed with HMAC-SHA256.
 * Set after they enter the 6-digit code we emailed. Pure (Web Crypto only).
 */
export const GUEST_SESSION_DAYS = 7;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`guest-session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signGuest(secret: string, email: string, now = Date.now()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ email, exp: now + GUEST_SESSION_DAYS * 86_400_000 })));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** The email if the token is valid and unexpired; otherwise null. Never throws. */
export async function verifyGuest(secret: string, token: string | undefined, now = Date.now()): Promise<string | null> {
  if (!token || secret.length < 32) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!same(fromB64url(sig), await hmac(secret, body))) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { email?: unknown; exp?: unknown };
    return typeof c.email === "string" && typeof c.exp === "number" && c.exp > now ? c.email : null;
  } catch {
    return null;
  }
}

/** SHA-256 of a sign-in code, salted with the email so codes are never stored in clear. */
export async function hashCode(email: string, code: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${email.toLowerCase()}:${code}`)));
  return b64url(d);
}
