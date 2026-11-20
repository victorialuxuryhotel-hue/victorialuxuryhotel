// Operational safeguards: alerts reach the team, health check, and list paging.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const MOCK = "http://127.0.0.1:4010";
const sql = (q) => execSync(`docker exec -i supabase_db_victoria-hotel psql -U postgres -qtA`, { input: q }).toString().trim();
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const waitText = (p, re, timeout = 20000) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout }, re.source);
const tag = `pg${Date.now().toString(36)}`;

// ---------------------------------------------------------------- Alerts
{
  await fetch(`${MOCK}/__alerts`, { method: "DELETE" });
  await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const ci = sql("select (hotel_today() + 640 + floor(random() * 60)::int)::text;");
  const co = sql(`select (date '${ci}' + 2)::text;`);
  const email = `alert-${tag}@example.com`;
  await p.goto(`${BASE}/book/details?category=standard&checkIn=${ci}&checkOut=${co}&guests=1`, { waitUntil: "networkidle0" });
  await p.waitForSelector("#name");
  await p.type("#name", "Alert Guest");
  await p.type("#email", email);
  await p.type("#phone", "+234 803 000 5555");
  await p.click("input[name=acceptTerms]");
  await p.click("button::-p-text(Continue to payment)");
  await p.waitForFunction(() => location.pathname.startsWith("/book/review/"), { timeout: 20000 });
  await waitText(p, /VL-[A-Z2-9]{6}/);
  const ref = (await p.evaluate(() => document.body.innerText)).match(/VL-[A-Z2-9]{6}/)[0];
  await p.click("button::-p-text(Pay securely)");
  await p.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 20000 });
  const payRef = new URL(p.url()).pathname.split("/").pop();
  await fetch(`${MOCK}/__control/tx/${payRef}`, { method: "POST", body: JSON.stringify({ reportedAmount: 100 }) }); // tampered
  await p.click("#pay-success");
  await p.waitForFunction(() => location.pathname.startsWith("/book/confirmation/"), { timeout: 30000 });
  await waitText(p, /checking your payment/);
  await ctx.close();

  let alerts = [];
  for (let i = 0; i < 40 && !alerts.length; i++) {
    alerts = (await (await fetch(`${MOCK}/__alerts`)).json()).filter((a) => (a.text ?? "").includes(ref));
    if (!alerts.length) await sleep(250);
  }
  check("a payment needing attention alerts the team", alerts.length === 1, JSON.stringify(alerts));
  const text = alerts[0]?.text ?? "";
  check("the alert names the booking and the problem", /doesn.t match the amount due/.test(text) && text.includes(ref), text);
  check("the alert contains no guest contact details, card data or keys", !text.includes(email) && !/\+234|4081|408408|sk_test|sb_secret/.test(text), text);
}

// ---------------------------------------------------------------- Health check
{
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.json();
  check("health check reports the database is reachable", res.status === 200 && body.ok === true);
  check("health check reveals nothing else", Object.keys(body).join(",") === "ok");
}

// ---------------------------------------------------------------- Paging
// 60 guests and 55 reservations with a shared, searchable name.
sql(`
  insert into guests (full_name, phone)
  select 'Paging ${tag} ' || lpad(n::text, 3, '0'), '+23480' || lpad(n::text, 8, '0') from generate_series(1, 60) n;
  insert into reservations (guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at)
  select g.id, (select id from room_categories where slug = 'standard'), hotel_today() + 500 + n::int, hotel_today() + 501 + n::int, 1, 4000000, 4000000, 'pending_payment', 'phone', now() + interval '1 day'
  from (select id, row_number() over (order by full_name) n from guests where full_name like 'Paging ${tag} %') g where n <= 55;
`);
{
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await p.type("#email", "frontdesk@victoria.test");
  await p.type("#password", "victoria-dev-2026!");
  await p.click("button[type=submit]");
  await p.waitForFunction(() => location.pathname === "/app", { timeout: 20000 });

  const rowsMatching = () => p.evaluate((t) => [...document.querySelectorAll("table tbody tr")].filter((r) => r.innerText.includes(`Paging ${t}`)).length, tag);

  // Guests: 60 → 50 + 10
  await p.goto(`${BASE}/app/guests?q=${encodeURIComponent(`Paging ${tag}`)}`, { waitUntil: "networkidle0" });
  await p.waitForSelector("table tbody tr");
  check("guests page 1 shows 50", (await rowsMatching()) === 50, String(await rowsMatching()));
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click("a::-p-text(Next)")]);
  await p.waitForSelector("table tbody tr");
  check("guests page 2 shows the other 10, search kept", (await rowsMatching()) === 10 && p.url().includes("page=2") && p.url().includes(tag), p.url());
  check("last page has no Next link", !(await p.$("a::-p-text(Next)")));
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click("a::-p-text(Previous)")]);
  check("Previous returns to page 1", !p.url().includes("page=") && (await rowsMatching()) === 50, p.url());

  // Reservations: 55 → 50 + 5, tab and search kept
  await p.goto(`${BASE}/app/reservations?tab=all&q=${encodeURIComponent(`Paging ${tag}`)}`, { waitUntil: "networkidle0" });
  await p.waitForSelector("table tbody tr");
  check("reservations page 1 shows 50", (await rowsMatching()) === 50, String(await rowsMatching()));
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click("a::-p-text(Next)")]);
  await p.waitForSelector("table tbody tr");
  check("reservations page 2 shows the other 5, tab and search kept", (await rowsMatching()) === 5 && p.url().includes("tab=all") && p.url().includes(tag), p.url());

  // No row appears on both pages
  const page2 = await p.evaluate(() => [...document.querySelectorAll("table tbody tr")].map((r) => r.innerText.split("\n")[0]));
  await p.goto(`${BASE}/app/reservations?tab=all&q=${encodeURIComponent(`Paging ${tag}`)}`, { waitUntil: "networkidle0" });
  await p.waitForSelector("table tbody tr");
  const page1 = await p.evaluate(() => [...document.querySelectorAll("table tbody tr")].map((r) => r.innerText.split("\n")[0]));
  check("no reservation appears on two pages", page2.every((x) => !page1.includes(x)));

  await p.goto(`${BASE}/app/guests?page=abc`, { waitUntil: "networkidle0" });
  check("a nonsense page number falls back to page 1", (await p.evaluate(() => document.body.innerText)).includes("Guests"));
  await ctx.close();
}

// Tidy up
sql(`delete from reservations where guest_id in (select id from guests where full_name like 'Paging ${tag} %');
     delete from guests where full_name like 'Paging ${tag} %';`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
