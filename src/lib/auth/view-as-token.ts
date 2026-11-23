export const VIEW_AS_MINUTES = 30;

export type ViewAsClaims = { staffId: string; sessionId: string; exp: number };

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signViewAs(secret: string, staffId: string, sessionId: string, now = Date.now()): Promise<string> {
  const claims: ViewAsClaims = { staffId, sessionId, exp: now + VIEW_AS_MINUTES * 60_000 };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

export async function verifyViewAs(secret: string, token: string | undefined, now = Date.now()): Promise<ViewAsClaims | null> {
  if (!token || secret.length < 32) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!same(fromB64url(sig), await hmac(secret, body))) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Partial<ViewAsClaims>;
    if (typeof claims.staffId !== "string" || typeof claims.sessionId !== "string" || typeof claims.exp !== "number") return null;
    return claims.exp > now ? (claims as ViewAsClaims) : null;
  } catch {
    return null;
  }
}
