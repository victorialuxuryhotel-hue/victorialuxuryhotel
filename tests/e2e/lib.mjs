// Shared helpers for the browser tests: local D1, Clerk development users, sign-in (with the authenticator app), checks.
import puppeteer from "puppeteer-core";
import { getPlatformProxy } from "wrangler";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
setTimeout(() => {
  console.log("FAIL  test file took longer than 10 minutes (stuck?)");
  process.exit(1);
}, 600_000).unref();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_DIR = join(ROOT, "tests", "e2e", ".state");
const ACCOUNTS_FILE = join(STATE_DIR, "accounts.json");
const SESSIONS_FILE = join(STATE_DIR, "sessions.json");

// ---------- database (the dev server's local D1) ----------

const proxy = await getPlatformProxy({ configPath: join(ROOT, "wrangler.jsonc"), persist: { path: join(homedir(), ".cache", "victoria-hotel", "wrangler", "v3") } });
const DB = proxy.env.DB;
/** The local R2 photos bucket the dev server writes to. */
export const PHOTOS = proxy.env.PHOTOS;
export const all = async (q, ...p) => (await DB.prepare(q).bind(...p).all()).results;
export const one = async (q, ...p) => DB.prepare(q).bind(...p).first();
export const val = async (q, ...p) => {
  const row = await one(q, ...p);
  return row ? Object.values(row)[0] : undefined;
};
export const run = (q, ...p) => DB.prepare(q).bind(...p).run();

// ---------- checks ----------

let pass = 0, fail = 0;
export function check(name, cond, extra = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
}

// ---------- TOTP (RFC 6238, what an authenticator app does) ----------

function base32(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}
export function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
/** A code that hasn't been used for this secret yet (servers refuse a code twice), waiting for the next 30 s step if needed. */
const usedSteps = new Map();
export async function freshTotp(secret) {
  let step = Math.floor(Date.now() / 30000);
  const last = Math.max(usedSteps.get(secret) ?? 0, readJson(join(STATE_DIR, "totp-steps.json"))[secret] ?? 0);
  if (step <= last) {
    await new Promise((r) => setTimeout(r, (last + 1) * 30000 - Date.now() + 500));
    step = Math.floor(Date.now() / 30000);
  }
  usedSteps.set(secret, step);
  const steps = readJson(join(STATE_DIR, "totp-steps.json"));
  steps[secret] = step;
  writeJson(join(STATE_DIR, "totp-steps.json"), steps);
  return totp(secret, step);
}

// ---------- Clerk development instance ----------

function readJson(f) {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}
function writeJson(f, v) {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(v, null, 2), { mode: 0o600 });
}

export async function clerk(method, path, body) {
  const key = process.env.CLERK_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) throw new Error("Browser tests need the Clerk development secret key (sk_test_…) in .env.local");
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Clerk ${method} ${path}: ${res.status} ${JSON.stringify(json?.errors?.[0] ?? json)}`);
  return json;
}

const STORED = {
  owner: { role: "owner", department: null, lead: 0 },
  general_manager: { role: "general_manager", department: null, lead: 0 },
  hotel_manager: { role: "front_desk", department: null, lead: 1 },
  finance: { role: "front_desk", department: "finance", lead: 0 },
  front_desk: { role: "front_desk", department: null, lead: 0 },
  restaurant_bar: { role: "front_desk", department: "restaurant_bar", lead: 0 },
  restaurant_bar_manager: { role: "front_desk", department: "restaurant_bar", lead: 1 },
};
export const TWO_STEP = ["owner", "general_manager", "hotel_manager", "finance"];

/** Creates a Clerk development user (test address: email code 424242) and, optionally, the matching staff record. */
export async function createUser(slug, role) {
  const email = `e2e-${slug}+clerk_test@victorialuxuryhotel.com`;
  const password = randomBytes(12).toString("base64url");
  const existing = await clerk("GET", `/users?email_address=${encodeURIComponent(email)}`);
  for (const u of existing) await clerk("DELETE", `/users/${u.id}`);
  const user = await clerk("POST", "/users", { email_address: [email], username: `e2e_${slug.replace(/\W/g, "_")}`, password, skip_password_checks: true });
  if (role) await upsertStaff(email, role, user.id, `E2E ${slug.replace(/[-_]/g, " ")}`);
  return { slug, role, email, password, username: user.username, clerkUserId: user.id };
}

export async function upsertStaff(email, role, clerkUserId, fullName) {
  const s = STORED[role];
  const found = await one("SELECT id FROM staff_profiles WHERE email = ?", email);
  if (found) {
    await run("UPDATE staff_profiles SET clerk_user_id = NULL WHERE clerk_user_id = ? AND id <> ?", clerkUserId, found.id);
    await run("UPDATE staff_profiles SET role = 'front_desk', department = NULL, department_lead = 0 WHERE id = ?", found.id);
    await run("UPDATE staff_profiles SET role = ?, department = ?, department_lead = ?, clerk_user_id = ?, is_active = 1 WHERE id = ?", s.role, s.department, s.lead, clerkUserId, found.id);
    return found.id;
  }
  const id = randomUUID();
  await run("INSERT INTO staff_profiles (id, clerk_user_id, full_name, email, role, department, department_lead) VALUES (?, ?, ?, ?, ?, ?, ?)", id, clerkUserId, fullName, email, s.role, s.department, s.lead);
  return id;
}

export async function deleteUser(account) {
  if (account?.clerkUserId) await clerk("DELETE", `/users/${account.clerkUserId}`).catch(() => {});
}

// ---------- browser ----------

export const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: process.env.HEADFUL ? false : true,
});

export async function session(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(viewport);
  p.setDefaultTimeout(20000);
  // Poll on a timer: the default (every animation frame) never fires on pages that are animating, e.g. the booking confirmation.
  const waitForFunction = p.waitForFunction.bind(p);
  p.waitForFunction = (fn, opts = {}, ...args) => waitForFunction(fn, { polling: 250, ...opts }, ...args);
  return { ctx, p };
}
/**
 * Clerk shows a "verify you are human" check to automated browsers on sign-up. A Clerk testing
 * token (development instances only) lets this page's Clerk requests through, as @clerk/testing does.
 */
export async function passBotCheck(p) {
  const fapi = atob((process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").split("_")[2] ?? "").replace(/\$$/, "");
  const { token } = await clerk("POST", "/testing_tokens");
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    if (r.isInterceptResolutionHandled()) return;
    const u = new URL(r.url());
    if (u.hostname !== fapi) return r.continue();
    u.searchParams.set("__clerk_testing_token", token);
    r.continue({ url: u.toString() });
  });
}
export const text = (p) => p.evaluate(() => document.body.innerText);
/** Polls `fn` from Node until it returns something truthy. */
export async function until(fn, what = "condition", timeout = 30000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
/** Polls the page text from Node (survives navigations and pages where in-page waits stall). */
export async function waitForText(p, re, timeout = 45000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const body = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (re.test(body)) return;
    if (Date.now() > deadline) {
      const seen = await p.evaluate(() => [...document.querySelectorAll("h1,h2,[role=alert]")].map((e) => e.innerText.trim()).join(" | ")).catch(() => "?");
      throw new Error(`Text ${re} not found on ${p.url()} (headings: ${seen})`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
export const settle = (p) => p.waitForNetworkIdle({ idleTime: 400, concurrency: 2, timeout: 8000 }).catch(() => {});
export async function go(p, path) {
  await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90000 });
  await settle(p);
}
export const navLabels = (p) => p.$$eval("aside nav a", (as) => as.map((a) => a.textContent.trim()));
/** Clicks the first visible element matching `selector` whose text contains `label` (pages often render one copy per screen size). */
export async function clickText(p, selector, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const h of await p.$$(`${selector}::-p-text(${label})`)) {
      if (await h.isVisible()) return h.click();
    }
    if (Date.now() > deadline) throw new Error(`No visible ${selector} with text "${label}" on ${p.url()}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
export async function fill(p, selector, value) {
  await p.waitForSelector(selector, { visible: true });
  // Forms (Clerk's especially) disable their inputs while a request is in flight.
  await p.waitForFunction((sel) => !document.querySelector(sel)?.disabled, {}, selector);
  // Clear through the native setter plus an input event, so React-controlled inputs see it too.
  await p.$eval(selector, (el) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.type(selector, String(value));
  const got = await p.$eval(selector, (el) => el.value);
  if (got !== String(value)) throw new Error(`fill ${selector}: field holds ${got.length} characters, expected ${String(value).length}`);
}

/** Signs in through the app's own sign-in form. Answers the new-device email code (424242) and the authenticator-app step. */
export async function signIn(p, account, { next = "", identifier = account.email, password = account.password, code } = {}) {
  await go(p, `/login${next}`);
  await fill(p, "#identifier", identifier);
  await fill(p, "#password", password);
  await p.click("button[type=submit]");
  const outcome = await p.waitForFunction(
    () => (location.pathname !== "/login" ? "left" : document.querySelector("#code") ? "code" : document.querySelector("[role=alert]") ? "alert" : null),
    { timeout: 20000 },
  ).then((h) => h.jsonValue());
  if (outcome !== "code") return settle(p);
  const asksApp = /authenticator app|backup code/i.test(await text(p));
  const value = code ?? (asksApp ? (account.totpSecret ? await freshTotp(account.totpSecret) : null) : "424242");
  if (value == null) throw new Error(`${account.email} was asked for an app code but has no authenticator set up`);
  await fill(p, "#code", value);
  await p.click("button[type=submit]");
  await p.waitForFunction(() => location.pathname !== "/login" || document.querySelector("[role=alert]"), { timeout: 20000 });
  await settle(p);
}

export async function signOut(p) {
  await p.evaluate(() => window.Clerk?.signOut());
  await settle(p);
}

// ---------- authenticator-app setup through the two-step page ----------

/** On /two-step: adds an authenticator app the way a person would, using "Can't scan?" to read the secret. Returns { secret, backupCodes }. */
export async function enrolAuthenticator(p) {
  await go(p, "/two-step/security");
  await clickText(p, "button", "Add two-step verification");
  await clickText(p, "button", "Authenticator application");
  await clickText(p, "button", "Can't scan QR code?");
  const secret = await p.waitForFunction(() => {
    const m = document.body.innerText.match(/\b([A-Z2-7]{16,})\b/);
    return m?.[1];
  }).then((h) => h.jsonValue());
  await clickText(p, "button", "Continue");
  await p.waitForSelector("input[autocomplete=one-time-code], input[name=code], input[data-otp-input]", { visible: true });
  await p.keyboard.type(totp(secret));
  usedSteps.set(secret, Math.floor(Date.now() / 30000));
  await waitForText(p, /backup codes/i);
  const backupCodes = await p.evaluate(() => [...document.body.innerText.matchAll(/\b[a-z0-9]{8}\b/g)].map((m) => m[0]));
  await clickText(p, "button", "Finish").catch(() => {});
  await settle(p);
  return { secret, backupCodes };
}

// ---------- role accounts (kept between runs in tests/e2e/.state, git-ignored) ----------

const ROLE_SLUG = { owner: "owner", general_manager: "gm", hotel_manager: "hotel-manager", finance: "finance", front_desk: "frontdesk", restaurant_bar: "bar", restaurant_bar_manager: "bar-manager" };

async function stillValid(acc, needsApp) {
  if (!acc?.clerkUserId) return false;
  try {
    const u = await clerk("GET", `/users/${acc.clerkUserId}`);
    if (u.banned || (needsApp && !(u.totp_enabled && acc.totpSecret))) return false;
  } catch {
    return false;
  }
  const s = await one("SELECT id FROM staff_profiles WHERE clerk_user_id = ? AND is_active = 1", acc.clerkUserId);
  if (!s) await upsertStaff(acc.email, acc.role, acc.clerkUserId, `E2E ${acc.slug}`);
  return true;
}

/** One Clerk user per role. The four managers/finance roles get an authenticator app on first use. */
/** Whether the Clerk instance offers authenticator apps. When it doesn't, the dev server must run with TWO_STEP_OPTIONAL=1. */
let mfaAvailable;
export async function twoStepAvailable() {
  if (mfaAvailable === undefined) {
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
    const host = Buffer.from(pk.split("_")[2] ?? "", "base64").toString().replace(/\$$/, "");
    const a = (await (await fetch(`https://${host}/v1/environment`)).json()).user_settings.attributes;
    mfaAvailable = Boolean(a.authenticator_app?.enabled && a.backup_code?.enabled);
  }
  return mfaAvailable;
}

export async function account(role) {
  const accounts = readJson(ACCOUNTS_FILE);
  const needsApp = TWO_STEP.includes(role) && (await twoStepAvailable());
  if (await stillValid(accounts[role], needsApp)) return accounts[role];
  const acc = await createUser(ROLE_SLUG[role], role);
  if (needsApp) {
    const { ctx, p } = await session();
    await signIn(p, acc);
    Object.assign(acc, await enrolAuthenticator(p));
    await ctx.close();
  }
  accounts[role] = acc;
  writeJson(ACCOUNTS_FILE, accounts);
  return acc;
}

/** A signed-in browser context for a role, reusing its saved session cookies when they still work. */
export async function as(role, { fresh = false, next = "" } = {}) {
  const acc = await account(role);
  const sessions = readJson(SESSIONS_FILE);
  const s = await session();
  if (!fresh && sessions[role]) {
    await s.p.setCookie(...sessions[role]);
    await go(s.p, "/app");
    if (!s.p.url().includes("/login") && !s.p.url().includes("/two-step")) return { ...s, acc };
  }
  await signIn(s.p, acc, { next });
  if (!fresh) {
    sessions[role] = (await s.p.cookies()).map(({ name, value, domain, path, expires, httpOnly, secure, sameSite }) => ({ name, value, domain, path, expires, httpOnly, secure, ...(sameSite ? { sameSite } : {}) }));
    writeJson(SESSIONS_FILE, sessions);
  }
  return { ...s, acc };
}

export async function finish() {
  await browser.close();
  await proxy.dispose();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
