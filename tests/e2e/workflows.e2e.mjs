// Real workflows through the browser against the dev server and local database.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const PW = "victoria-dev-2026!";
const sql = (q) => execSync(`docker exec -i supabase_db_victoria-hotel psql -U postgres -qtA`, { input: q }).toString().trim();
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const text = (p) => p.evaluate(() => document.body.innerText);
const waitText = (p, re, timeout = 15000) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout }, re.source);
const waitPath = (p, re, timeout = 15000) => p.waitForFunction((src) => new RegExp(src).test(location.pathname), { timeout }, re.source);
const today = sql("select hotel_today();");
const plus = (n) => sql(`select (hotel_today() + ${n})::text;`);

async function page(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(viewport);
  p.on("dialog", (d) => d.accept());
  return { ctx, p };
}
async function login(p, email) {
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await p.type("#email", email);
  await p.type("#password", PW);
  await p.click("button[type=submit]");
  await waitPath(p, /^\/app$/);
}

// ---------------------------------------------------------------- Guest books online
{
  const { ctx, p } = await page({ width: 390, height: 844 });
  const [ci, co] = [plus(20), plus(22)];
  await p.goto(`${BASE}/book?checkIn=${ci}&checkOut=${co}&guests=2`, { waitUntil: "networkidle0" });
  const t = await text(p);
  check("guest sees live room options with totals", /Choose your room/.test(t) && /₦/.test(t));
  check("no room counts are shown to guests", !/rooms? left|\d+ available|only \d/i.test(t));
  await p.click('a[href^="/book/details?category=standard"]');
  await p.waitForSelector("#name", { timeout: 15000 });
  check("selecting a room opens the details step", p.url().includes("/book/details"));
  await p.type("#name", "Online Guest");
  await p.type("#email", `online-${Date.now()}@example.com`);
  await p.type("#phone", "not a phone");
  await p.click("input[name=acceptTerms]");
  await p.click("button::-p-text(Continue to payment)");
  await waitText(p, /valid phone number/);
  check("invalid phone is rejected by the server", true);
  check("guest's other details are kept after the error", (await p.$eval("#name", (e) => e.value)) === "Online Guest");
  await p.$eval("#phone", (e) => (e.value = ""));
  await p.type("#phone", "+234 803 000 1234");
  await p.click("button::-p-text(Continue to payment)");
  await waitPath(p, /^\/book\/review\//);
  await waitText(p, /VL-[A-Z2-9]{6}/);
  const review = await text(p);
  const ref = review.match(/VL-[A-Z2-9]{6}/)?.[0];
  check("guest reaches review with a booking reference", Boolean(ref), review.slice(0, 200));
  const row = sql(`select r.status || '|' || r.source || '|' || (r.total_amount_kobo = c.nightly_rate_kobo * 2) from reservations r join room_categories c on c.id = r.category_id where r.reference = '${ref}';`);
  check("database holds it as a pending website booking priced by the server", /^pending_payment\|website\|t(rue)?$/.test(row), row);
  await ctx.close();
}

// ---------------------------------------------------------------- Walk-in, override, assign, check-in, check-out
let resUrl;
{
  const { ctx, p } = await page();
  await login(p, "frontdesk@victoria.test");
  await p.goto(`${BASE}/app/reservations/new`, { waitUntil: "networkidle0" });
  await p.$eval("#nco", (e, v) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }, plus(2));
  await p.type("#gn", "Walk In Guest");
  await p.type("#gp", "+2348000009999");
  await p.click("button::-p-text(Create reservation)");
  await waitPath(p, /^\/app\/reservations\/[0-9a-f-]{36}$/);
  await waitText(p, /Awaiting payment/);
  resUrl = p.url().split("?")[0];
  const t = await text(p);
  check("front desk creates a walk-in; it awaits payment", /Awaiting payment/.test(t) && /created/.test(t));
  check("front desk does not see manager override options", !/Manager options/.test(t));
  await ctx.close();
}
{
  const { ctx, p } = await page();
  await login(p, "gm@victoria.test");
  await p.goto(resUrl, { waitUntil: "networkidle0" });
  await p.waitForSelector("h1");
  await p.click("summary::-p-text(Manager options)");
  await p.type("#override-reason", "Paid cash at reception, receipt book 12");
  await p.click("button::-p-text(Confirm anyway)");
  await waitText(p, /Confirmed/);
  const id = resUrl.split("/").pop();
  check("GM confirms with a reason", sql(`select status from reservations where id='${id}';`) === "confirmed");
  check("override is in the activity log with the reason", sql(`select count(*) from activity_log where entity_id='${id}' and action='reservation.payment_override' and metadata->>'reason' like 'Paid cash%';`) === "1");
  await ctx.close();
}
{
  const { ctx, p } = await page();
  await login(p, "frontdesk@victoria.test");
  await p.goto(resUrl, { waitUntil: "networkidle0" });
  await p.waitForSelector("h1");
  const id = resUrl.split("/").pop();
  const roomValue = await p.$eval("#room optgroup option", (o) => o.value);
  await p.select("#room", roomValue);
  await p.click("button::-p-text(Assign)");
  await waitText(p, /Room updated/);
  const roomNo = sql(`select rm.room_number from reservations r join rooms rm on rm.id = r.room_id where r.id='${id}';`);
  check("front desk assigns a room", Boolean(roomNo));
  await p.goto(resUrl, { waitUntil: "networkidle0" });
  await p.waitForSelector("h1");
  await p.click("button::-p-text(Check in)");
  await waitText(p, /Checked in/);
  check("front desk checks the guest in", sql(`select status from reservations where id='${id}';`) === "checked_in");
  await p.goto(`${BASE}/app/rooms`, { waitUntil: "networkidle0" });
  const tile = await p.$$eval("summary", (els, n) => els.find((e) => e.innerText.startsWith(n))?.innerText ?? "", roomNo);
  check("room board shows the room occupied by the guest", /Occupied/.test(tile) && /Walk In Guest/.test(tile), tile);
  await p.goto(resUrl, { waitUntil: "networkidle0" });
  await p.waitForSelector("h1");
  await p.click("button::-p-text(Check out)");
  await waitText(p, /Checked out/);
  check("check-out with a balance warns, then completes", sql(`select status from reservations where id='${id}';`) === "checked_out");
  check("room needs cleaning after check-out", sql(`select readiness from rooms where room_number='${roomNo}';`) === "needs_cleaning");
  await p.goto(`${BASE}/app/rooms`, { waitUntil: "networkidle0" });
  await p.evaluate((n) => [...document.querySelectorAll("summary")].find((e) => e.innerText.startsWith(n))?.click(), roomNo);
  await p.click("details[open] button::-p-text(Mark ready)");
  await p.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 1500));
  check("front desk marks the room ready from the board", sql(`select readiness from rooms where room_number='${roomNo}';`) === "ready");
  check("every step is in the activity log", sql(`select string_agg(action, ',' order by id) from activity_log where entity_id='${id}';`) === "reservation.created,reservation.payment_override,reservation.room_assigned,reservation.checked_in,reservation.checked_out");
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed (hotel date ${today})`);
process.exit(fail ? 1 : 0);
