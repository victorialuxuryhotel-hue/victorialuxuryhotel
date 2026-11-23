import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
const BASE = "http://localhost:3000";
const PW = "victoria-dev-2026!";
const sql = (q) => execSync(`docker exec -i supabase_db_victoria-hotel psql -U postgres -qtA`, { input: q }).toString().trim();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
let pass = 0, fail = 0;
const waitForUrl = (p, pred) => p.waitForFunction(pred, { timeout: 15000 });
const waitForText = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout: 15000 }, re.source);

const check = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

async function session() { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 900 }); return { ctx, p }; }
async function login(p, email, password, next = "") {
  await p.goto(`${BASE}/login${next}`, { waitUntil: "networkidle0" });
  await p.type("#email", email); await p.type("#password", password);
  await p.click("button[type=submit]");
  await p.waitForFunction(() => location.pathname !== "/login" || document.querySelector("[role=alert]"), { timeout: 15000 });
  await p.waitForNetworkIdle({ idleTime: 300 }).catch(() => {});
}
const text = (p) => p.evaluate(() => document.body.innerText);
const navLabels = (p) => p.$$eval('aside nav[aria-label=Management] a', (as) => as.map((a) => a.textContent.trim()));

{ const { ctx, p } = await session();
  await p.goto(`${BASE}/app/reservations`, { waitUntil: "networkidle0" });
  check("signed-out visitor is sent to sign-in", p.url().startsWith(`${BASE}/login?next=%2Fapp%2Freservations`), p.url());
  await ctx.close(); }

{ const { ctx, p } = await session();
  await login(p, "frontdesk@victoria.test", "wrong-password-1");
  check("wrong password is rejected with a generic message", p.url().includes("/login") && (await text(p)).includes("Email or password is incorrect"));
  await ctx.close(); }

{ const { ctx, p } = await session();
  await login(p, "nobody@victoria.test", "whatever-123");
  check("unknown email gets the same message", (await text(p)).includes("Email or password is incorrect"));
  await ctx.close(); }

{ const { ctx, p } = await session();
  await login(p, "notstaff@victoria.test", "not-staff-pass-1");
  check("non-staff account is refused", (await text(p)).includes("does not have access"));
  await p.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
  check("non-staff account has no session afterwards", p.url().includes("/login"), p.url());
  await ctx.close(); }

{ const { ctx, p } = await session();
  await login(p, "frontdesk@victoria.test", PW, "?next=%2Fapp%2Frooms");
  check("front desk signs in and returns to the requested page", p.url() === `${BASE}/app/rooms`, p.url());
  const nav = await navLabels(p);
  check("front desk nav hides Settings", !nav.includes("Settings") && nav.includes("Reservations"), nav.join(","));
  await p.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
  check("front desk opening /app/settings directly is denied", (await text(p)).includes("You don't have access to this page"));
  sql(`update staff_profiles set is_active = false where email = 'frontdesk@victoria.test';`);
  await p.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
  check("deactivated mid-session loses access on the next request", p.url().includes("/login"), p.url());
  sql(`update staff_profiles set is_active = true where email = 'frontdesk@victoria.test';`);
  await ctx.close(); }

{ const { ctx, p } = await session();
  await login(p, "gm@victoria.test", PW);
  await p.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
  const t = await text(p);
  check("GM sees booking rules and activity, not staff management", t.includes("Booking rules") && t.includes("Activity log") && !t.includes("Send invite"));
  await p.$eval("#whold", (el) => { el.value = ""; }); await p.type("#whold", "45");
  await p.click("button::-p-text(Save rules)");
  await waitForText(p, /Booking rules saved|Check the highlighted/).catch(() => {});
  check("GM saves a booking rule", (await text(p)).includes("Booking rules saved"));
  check("rule saved in the database", sql(`select website_hold_minutes from hotel_settings;`) === "45");
  const audit = sql(`select a.action || '|' || s.email from activity_log a join staff_profiles s on s.id = a.actor_id where a.action = 'settings.updated' order by a.id desc limit 1;`);
  check("change is in the activity log, attributed to the GM", audit === "settings.updated|gm@victoria.test", audit);
  sql(`update hotel_settings set website_hold_minutes = 30;`);
  await p.$eval("#whold", (el) => { el.removeAttribute("min"); el.value = "1"; });
  await p.click("button::-p-text(Save rules)");
  await waitForText(p, /At least 10 minutes/).catch(() => {});
  check("server rejects an invalid hold time", (await text(p)).includes("At least 10 minutes") && sql(`select website_hold_minutes from hotel_settings;`) === "30");
  await ctx.close(); }

{ const { ctx, p } = await session();
  await login(p, "owner@victoria.test", PW, "?next=https%3A%2F%2Fevil.example");
  check("open redirect attempt lands on /app instead", p.url() === `${BASE}/app`, p.url());
  await p.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
  const t = await text(p);
  check("owner sees staff management", t.includes("Send invite") && t.includes("frontdesk@victoria.test"));
  await p.click('aside button[aria-label="Sign out"]');
  await waitForUrl(p, () => location.pathname === "/login");
  check("sign out returns to sign-in", p.url().includes("/login"), p.url());
  await p.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
  check("after sign out /app is protected again", p.url().includes("/login"), p.url());
  await ctx.close(); }

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
