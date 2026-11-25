import { randomUUID } from "node:crypto";
import { as, BASE, check, clickText, fill, finish, go, run, session, text, until, val, waitForText } from "./lib.mjs";

const MOCK = "http://127.0.0.1:4010";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = `pg${Date.now().toString(36)}`;
const hotelDay = (n) => val(`SELECT date('now', '+1 hour', '+${n} days')`);

{
  await fetch(`${MOCK}/__alerts`, { method: "DELETE" });
  await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
  const { ctx, p } = await session();
  const offset = 640 + Math.floor(Math.random() * 60);
  const [ci, co] = [await hotelDay(offset), await hotelDay(offset + 2)];
  const email = `alert-${tag}@example.com`;
  await go(p, `/book/details?category=standard&checkIn=${ci}&checkOut=${co}&guests=1`);
  await fill(p, "#name", "Alert Guest");
  await fill(p, "#email", email);
  await fill(p, "#phone", "+234 803 000 5555");
  await p.click("input[name=acceptTerms]");
  await clickText(p, "button", "Continue to payment");
  await waitForText(p, /VL-[A-Z2-9]{6}/);
  const ref = (await text(p)).match(/VL-[A-Z2-9]{6}/)[0];
  await clickText(p, "button", "Pay ₦");
  await p.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 30000 });
  const payRef = new URL(p.url()).pathname.split("/").pop();
  await fetch(`${MOCK}/__control/tx/${payRef}`, { method: "POST", body: JSON.stringify({ reportedAmount: 100 }) });
  await p.click("#pay-success");
  await waitForText(p, /checking your payment/);
  await ctx.close();

  let alerts = [];
  for (let i = 0; i < 40 && !alerts.length; i++) {
    alerts = (await (await fetch(`${MOCK}/__alerts`)).json()).filter((a) => (a.text ?? "").includes(ref));
    if (!alerts.length) await sleep(250);
  }
  check("a payment needing attention alerts the team", alerts.length === 1, JSON.stringify(alerts));
  const t = alerts[0]?.text ?? "";
  check("the alert names the booking and the problem", /doesn.t match the amount owed/.test(t) && t.includes(ref), t);
  check("the alert contains no guest contact details, card data or keys", !t.includes(email) && !/\+234|4081|408408|sk_test|sk_live/.test(t), t);
}

{
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.json().catch(() => ({}));
  check("health check reports the database is reachable", res.status === 200 && body.ok === true);
  check("health check reveals nothing else", Object.keys(body).join(",") === "ok");
}

if (process.env.E2E_BASE) {
  const res = await fetch(`${BASE}/book`);
  const csp = res.headers.get("content-security-policy") ?? "";
  check("public pages send a content security policy", /default-src/.test(csp) && /frame-ancestors 'none'/.test(csp), csp.slice(0, 200));
} else {
  console.log("SKIP  security headers (added by worker.ts; run against `pnpm cf:preview` with E2E_BASE set)");
}

const standard = await val("SELECT id FROM room_categories WHERE slug = 'standard'");
const rate = await val("SELECT nightly_rate_kobo FROM room_categories WHERE id = ?", standard);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const reference = () => `VL-${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")}`;
const pagingIds = [];
for (let n = 1; n <= 60; n++) {
  const guestId = randomUUID();
  await run("INSERT INTO guests (id, full_name, phone) VALUES (?, ?, ?)", guestId, `Paging ${tag} ${String(n).padStart(3, "0")}`, `+23480${String(n).padStart(8, "0")}`);
  if (n > 55) continue;
  const id = randomUUID();
  pagingIds.push(id);
  await run(
    `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, date('now', '+1 hour', ?), date('now', '+1 hour', ?), 1, ?, ?, 'pending_payment', 'phone', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 day'))`,
    id, reference(), randomUUID(), guestId, standard, `+${500 + n} days`, `+${501 + n} days`, rate, rate,
  );
}

{
  const { ctx, p } = await as("front_desk");
  const rowsMatching = () => p.evaluate((t) => [...document.querySelectorAll("table tbody tr")].filter((r) => r.innerText.includes(`Paging ${t}`)).length, tag);
  const q = encodeURIComponent(`Paging ${tag}`);

  const nextPage = async (n) => {
    await clickText(p, "a", "Next");
    await p.waitForFunction((k) => location.search.includes(`page=${k}`), {}, n);
    await p.waitForFunction(() => document.querySelectorAll("table tbody tr").length > 0);
  };
  const firstCells = () => p.evaluate(() => [...document.querySelectorAll("table tbody tr")].map((r) => r.innerText.split("\n")[0]));

  await go(p, `/app/guests?q=${q}`);
  check("guests page 1 shows 20", (await rowsMatching()) === 20, String(await rowsMatching()));
  await nextPage(2);
  check("guests page 2 shows 20 more, search kept", (await rowsMatching()) === 20 && p.url().includes(tag), p.url());
  await nextPage(3);
  check("guests page 3 shows the last 20", (await rowsMatching()) === 20, String(await rowsMatching()));
  check("last page has no Next link", !(await p.$("a::-p-text(Next)")));
  await clickText(p, "a", "Previous");
  await p.waitForFunction(() => location.search.includes("page=2"));
  check("Previous goes back a page", (await rowsMatching()) === 20, p.url());

  await go(p, `/app/reservations?tab=all&q=${q}`);
  check("reservations page 1 shows 20", (await rowsMatching()) === 20, String(await rowsMatching()));
  const page1 = await firstCells();
  await nextPage(2);
  await nextPage(3);
  check("reservations last page shows the other 15, tab and search kept", (await rowsMatching()) === 15 && p.url().includes("tab=all") && p.url().includes(tag), p.url());
  const page3 = await firstCells();
  check("no reservation appears on two pages", page3.every((x) => !page1.includes(x)));

  await go(p, "/app/guests?page=abc");
  check("a nonsense page number falls back to page 1", (await text(p)).includes("Guests") && !/error|something went wrong/i.test(await text(p)));
  await ctx.close();
}

for (const id of pagingIds) {
  await run("UPDATE reservations SET status = 'cancelled', cancellation_reason = 'Browser test paging data' WHERE id = ?", id).catch(() => {});
}

{
  // Links that can't exist get a real 404 from the Proxy; unknown-but-plausible ones are kept out of search.
  const status = async (path) => (await fetch(`${BASE}${path}`, { redirect: "manual" })).status;
  check("a malformed booking link is a 404", (await status("/book/review/not-a-token")) === 404);
  check("a malformed room link is a 404", (await status("/rooms/nope%20room!")) === 404);
  const unknown = await (await fetch(`${BASE}/rooms/nope-room`)).text();
  check("an unknown room says Page not found and isn't indexed", /<title>Page not found/.test(unknown) && /noindex/.test(unknown));
  check("a real room page is fine", (await status("/rooms/deluxe")) === 200);
}

{
  // H8: an old browser gets a warning (not blocked); the browser in use is noted once per session.
  const { ctx, p } = await session();
  await p.setUserAgent("Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36");
  await go(p, "/login");
  await waitForText(p, /too old for the system/);
  check("an old browser on Windows 7 is warned on the sign-in page", /Use Google Chrome on Windows 10 or 11/.test(await text(p)));
  check("but can still sign in", Boolean(await p.$("input[name=identifier], input[name=username], input[type=password], form")));
  await ctx.close();
}
{
  const { ctx, p } = await as("front_desk");
  const count = () => val("SELECT count(*) FROM activity_log WHERE action = 'staff.browser'");
  await go(p, "/app/today");
  await new Promise((r) => setTimeout(r, 1500));
  const afterFirst = await count();
  check("the browser in use is noted in Activity", afterFirst >= 1);
  await go(p, "/app/reservations");
  await go(p, "/app/rooms");
  await new Promise((r) => setTimeout(r, 1500));
  check("a current browser gets no warning", !/too old for the system/.test(await text(p)));
  check("it's noted once per session, not on every page", (await count()) === afterFirst, `${afterFirst} → ${await count()}`);
  await ctx.close();
}

{
  // H10: front desk shortcuts. "/" jumps to search; Esc closes the Cancel popover.
  const { ctx, p } = await as("front_desk");
  const focusedSearch = () => p.evaluate(() => document.activeElement?.hasAttribute("data-search") ?? false);
  await go(p, "/app/reservations");
  await p.keyboard.press("/");
  check("/ focuses the search box on Bookings", await focusedSearch());
  await go(p, "/app/today");
  await p.keyboard.press("/");
  check("/ focuses Find a booking on Today", await focusedSearch());
  await p.keyboard.type("VL-");
  await p.keyboard.press("Enter");
  await p.waitForNavigation({ waitUntil: "load" }).catch(() => {});
  check("searching from Today opens Bookings with the search", /\/app\/reservations\?.*q=VL-/.test(p.url()), p.url());
  const pending = await val("SELECT id FROM reservations WHERE status IN ('pending_payment', 'confirmed') ORDER BY created_at DESC LIMIT 1");
  await go(p, `/app/reservations/${pending}`);
  const popover = await p.$("details[data-popover]");
  if (popover) {
    await p.click("details[data-popover] > summary");
    await p.keyboard.press("Escape");
    check("Esc closes the Cancel popover", !(await p.$eval("details[data-popover]", (d) => d.open)));
  }
  await ctx.close();
}

{
  // I1: payments to confirm. The general manager ticks a transfer off; "Not found" raises an alert.
  const { ctx, p } = await as("general_manager");
  await go(p, "/app");
  const dash = await text(p);
  check("the dashboard says how many payments are waiting to be confirmed", /Needs attention · \d+ payments? \(₦[\d,]+\) to confirm/.test(dash), dash.slice(0, 200));
  await go(p, "/app/payments/confirm");
  const count = async () => p.$$eval("li", (ls) => ls.filter((l) => l.querySelector("button")?.innerText.includes("Matches")).length);
  const before = await count();
  check("payments to confirm lists transfers and POS payments", before >= 2, String(before));
  await clickText(p, "button", "Matches");
  await until(async () => (await count()) === before - 1, "one confirmed", 15000);
  check("Matches takes it off the list", true);
  await fetch(`${MOCK}/__alerts`, { method: "DELETE" });
  await clickText(p, "button", "Not found");
  await fill(p, "input[name=note]", "Not on the GTB statement (browser test)");
  await p.$$eval("button[type=submit]", (bs) => bs.find((b) => b.innerText.trim() === "Not found")?.click());
  await until(async () => (await count()) === before - 2, "one not found", 15000);
  const alerts = await until(async () => {
    const a = (await (await fetch(`${MOCK}/__alerts`)).json()).filter((x) => /wasn't found on the statement/.test(x.text ?? ""));
    return a.length ? a : null;
  }, "alert", 15000).catch(() => []);
  check("Not found raises an alert", alerts.length === 1, JSON.stringify(alerts).slice(0, 200));
  await ctx.close();
}

await finish();
