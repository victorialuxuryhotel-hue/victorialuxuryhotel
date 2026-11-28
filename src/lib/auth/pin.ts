// PIN hashing and station tokens. PBKDF2-SHA256 with a per-person salt (Workers allow up to 100,000
// iterations). An optional server-side pepper (PIN_PEPPER secret) is mixed in, so a copy of the
// database alone isn't enough to try the 10^4–10^6 possible PINs offline.

const enc = new TextEncoder();
export const PIN_ITERATIONS = 100_000;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** 4 to 6 digits; not all the same digit and not a straight run (1234, 4321). */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "A PIN is 4 to 6 digits.";
  if (/^(\d)\1+$/.test(pin)) return "Choose a PIN that isn't the same digit repeated.";
  const d = [...pin].map(Number);
  const step = d[1]! - d[0]!;
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1]! === step)) return "Choose a PIN that isn't a straight run like 1234.";
  return null;
}

async function derive(pin: string, salt: Uint8Array, iterations: number, pepper: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`${pin}\u0000${pepper}`), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashPin(pin: string, pepper = ""): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PIN_ITERATIONS}$${b64url(salt)}$${b64url(await derive(pin, salt, PIN_ITERATIONS, pepper))}`;
}

export async function verifyPin(pin: string, stored: string | null | undefined, pepper = ""): Promise<boolean> {
  if (!stored || !/^\d{4,6}$/.test(pin)) return false;
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2" || !salt || !hash || !Number.isInteger(iterations) || iterations < 1 || iterations > PIN_ITERATIONS) return false;
  try {
    const want = fromB64url(hash);
    const got = await derive(pin, fromB64url(salt), iterations, pepper);
    if (want.length !== got.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want[i]! ^ got[i]!;
    return diff === 0;
  } catch {
    return false;
  }
}

/** A random token for a cookie, and the SHA-256 hex the database keeps. */
export function newToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function tokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
