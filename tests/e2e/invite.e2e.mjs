import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
const BASE = "http://localhost:3000", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`docker exec -i supabase_db_victoria-hotel psql -U postgres -qtA`, { input: q }).toString().trim();
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitForUrl = (p, pred) => p.waitForFunction(pred, { timeout: 15000 });
const waitForText = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout: 15000 }, re.source);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const email = `newstaff-${Date.now()}@victoria.test`;

let ctx = await browser.createBrowserContext(); let p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type("#email", "owner@victoria.test"); await p.type("#password", "victoria-dev-2026!");
await p.click("button[type=submit]"); await waitForUrl(p, () => location.pathname === "/app");
await p.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
await p.type("#sname", "New Receptionist"); await p.type("#semail", email);
await p.click('button::-p-text(Send invite)'); await waitForText(p, /Invitation sent|already has an account|Could not/).catch(() => {});
check("owner sees invitation confirmation", (await p.evaluate(() => document.body.innerText)).includes(`Invitation sent to ${email}`));
check("profile created as front desk", sql(`select role from staff_profiles where email='${email}';`) === "front_desk");
check("invite is audited", sql(`select count(*) from activity_log a join staff_profiles s on s.id = a.entity_id where a.action='staff.created' and s.email='${email}';`) === "1");
await ctx.close();

let link;
for (let i = 0; i < 10 && !link; i++) {
  const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
  const id = list.messages?.[0]?.ID;
  if (id) { const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json(); link = msg.HTML.match(/href="([^"]+auth\/confirm[^"]+)"/)?.[1]?.replaceAll("&amp;", "&"); }
  if (!link) await sleep(500);
}
check("invite email arrives with a confirm link", Boolean(link), "no link");

ctx = await browser.createBrowserContext(); p = await ctx.newPage();
await p.goto(link.replace("http://127.0.0.1:3000", BASE).replace("http://localhost:3000", BASE), { waitUntil: "networkidle0" });
check("invite link signs them in and opens the account page", p.url() === `${BASE}/app/account`, p.url());
await p.type("#pw", "short"); await p.type("#pw2", "short");
await p.$eval("#pw", (e) => e.removeAttribute("minlength"));
await p.click("button::-p-text(Save password)"); await waitForText(p, /at least 10 characters|Password saved|Could not/).catch(() => {});
check("server rejects a short password", (await p.evaluate(() => document.body.innerText)).includes("at least 10 characters"));
await p.$eval("#pw", (e) => (e.value = "")); await p.$eval("#pw2", (e) => (e.value = ""));
await p.type("#pw", "a-strong-pass-2026"); await p.type("#pw2", "a-strong-pass-2026");
await p.click("button::-p-text(Save password)"); await waitForText(p, /Password saved|Could not|weak/).catch(() => {});
check("password saved", (await p.evaluate(() => document.body.innerText)).includes("Password saved"));
await ctx.close();

ctx = await browser.createBrowserContext(); p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type("#email", email); await p.type("#password", "a-strong-pass-2026");
await p.click("button[type=submit]"); await waitForUrl(p, () => location.pathname === "/app").catch(() => {});
check("new staff member signs in with their password", p.url() === `${BASE}/app`, p.url());
const nav = await p.$$eval('aside nav a', (as) => as.map((a) => a.textContent.trim()));
check("and gets front-desk navigation", !nav.includes("Settings"), nav.join(","));
const p2 = await (await browser.createBrowserContext()).newPage();
await p2.goto(link.replace("http://127.0.0.1:3000", BASE), { waitUntil: "networkidle0" });
check("invite link cannot be reused", p2.url().includes("/login?error=link"), p2.url());
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
