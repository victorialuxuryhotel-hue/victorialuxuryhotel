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
  await clickText(p, "button[type=submit]", "Continue");
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
  // The guest's name (skipping the initials avatar in front of it).
  const firstCells = () => p.evaluate(() => [...document.querySelectorAll("table tbody tr")].map((r) => r.innerText.split("\n").map((l) => l.trim()).find((l) => l.length > 2)));

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
  // I2: Available tonight on Today. New booking opens the form for tonight with the room type chosen.
  const { ctx, p } = await as("front_desk");
  await go(p, "/app/today");
  // I5: the business day at the bottom of the sidebar.
  const day = await until(() => p.evaluate(() => document.querySelector("aside [data-business-day]")?.textContent ?? null), "business day in the sidebar");
  check("the sidebar shows the business day", /^Business day · \w{3} \d{1,2} \w{3}/.test(day), day);
  await waitForText(p, /Available tonight/i);
  // I3: "Arriving today · 1 of 3 arrived": the still-to-come part is the list on screen.
  const progress = await p.$$eval("[role=progressbar]", (bars) =>
    bars.map((b) => ({ done: Number(b.getAttribute("aria-valuenow")), total: Number(b.getAttribute("aria-valuemax")), rows: b.closest(".rounded-card")?.querySelectorAll("ul > li").length ?? 0 })),
  );
  check("Today's headings count arrivals and departures done, with a progress bar", progress.length >= 1, JSON.stringify(progress));
  check("and the count still to go is the list on screen", progress.every((x) => x.total - x.done === x.rows), JSON.stringify(progress));
  // I4: where each booking came from, as a neutral badge.
  const SOURCES = /^(Website|Walk-in|Phone|WhatsApp|Staff)$/;
  const sourceBadges = (page) => page.$$eval("[data-source]", (b) => b.filter((x) => x.offsetParent).map((x) => x.textContent.trim()));
  const todaySources = await sourceBadges(p);
  // Arriving / leaving lists and the in-house table (Needs you now rows are actions, not bookings).
  const todayRows = await p.$$eval(".rounded-card ul > li:not([data-kind]):has(a[href^='/app/reservations/'], a[href*='booking=']), .rounded-card tbody tr", (l) => l.filter((x) => x.offsetParent).length);
  check("every booking on Today shows where it came from", todayRows > 0 && todaySources.length === todayRows && todaySources.every((s) => SOURCES.test(s)), `${todaySources.length} badges, ${todayRows} rows`);
  const card = await p.$("[data-tonight]:has(a[href*='/app/reservations/new?type='])");
  check("Today shows the room types free tonight with New booking", Boolean(card) || /Fully booked tonight/.test(await text(p)));
  if (card) {
    const type = await card.evaluate((el) => el.getAttribute("data-tonight"));
    check("each card says how many are free of the rooms in service", /\d+ of \d+ free · ₦/.test(await card.evaluate((el) => el.textContent)));
    await go(p, await card.$eval("a", (a) => a.getAttribute("href")));
    await p.waitForSelector("input[name=categoryId]");
    const chosen = await until(() => p.evaluate(() => document.querySelector("input[name=categoryId]:checked")?.value ?? null), "type chosen");
    check("New booking comes with that room type chosen", chosen === type, `${chosen} vs ${type}`);
    check("and tonight's date", (await p.$eval("input[name=checkIn]", (i) => i.value)) === (await val("SELECT date('now', '-5 hours')")));
  }
  await go(p, "/app/reservations?tab=all");
  const listSources = await sourceBadges(p);
  const listRows = await p.$$eval("table tbody tr", (r) => r.filter((x) => x.offsetParent).length);
  check("and every row on Bookings", listRows > 0 && listSources.length === listRows && listSources.every((s) => SOURCES.test(s)), `${listSources.length} badges, ${listRows} rows`);
  await ctx.close();
}

{
  // I6: room calendar. Fits the desk screen; an empty night starts a booking for that type, date and room.
  const { ctx, p } = await as("front_desk");
  await p.setViewport({ width: 1366, height: 768 });
  await go(p, "/app/calendar");
  await p.waitForSelector("[data-calendar] [data-lane]");
  const fit = await p.evaluate(() => {
    const cal = document.querySelector("[data-calendar]");
    return { page: document.documentElement.scrollWidth <= window.innerWidth, grid: cal.scrollWidth <= cal.clientWidth + 1 };
  });
  check("the calendar fits 1366×768 without scrolling sideways", fit.page && fit.grid, JSON.stringify(fit));
  check("it has the legend and a free count per night for each room type", /Awaiting payment/.test(await text(p)) && (await p.$$("[data-type] [data-free]")).length % 14 === 0);
  const cell = await p.$("[data-lane]:not([data-lane=unassigned]) a[href*='/app/reservations/new?type='][href*='&room=']");
  const href = await cell.evaluate((a) => a.getAttribute("href"));
  const q = new URL(href, "http://x").searchParams;
  const roomNumber = await val("SELECT room_number FROM rooms WHERE id = ?", q.get("room"));
  await go(p, href);
  await p.waitForSelector("input[name=categoryId]");
  const form = await until(() => p.evaluate(() => ({
    type: document.querySelector("input[name=categoryId]:checked")?.value ?? null,
    checkIn: document.querySelector("input[name=checkIn]")?.value,
    asked: document.querySelector("[data-asked-room]")?.getAttribute("data-asked-room") ?? null,
  })).then((f) => (f.type && f.asked ? f : null)), "form prefilled");
  check("an empty night opens New booking with the type, date and room", form.type === q.get("type") && form.checkIn === q.get("checkIn") && form.asked === roomNumber, JSON.stringify(form));
  await ctx.close();
}

{
  // I7: booking side panel from Today, the calendar and Bookings. URL-backed; Esc closes; same next action as the booking page.
  const { ctx, p } = await as("front_desk");
  await p.setViewport({ width: 1366, height: 768 });
  const panelRef = () => p.evaluate(() => document.querySelector("[data-panel-reference]")?.getAttribute("data-panel-reference") ?? null);
  const nextText = (sel) => p.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);

  await go(p, "/app/today");
  const link = await p.$("a[href^='/app/today?booking=']");
  check("Today's guest names open the side panel", Boolean(link));
  const ref = new URL(await link.evaluate((a) => a.getAttribute("href")), "http://x").searchParams.get("booking");
  await go(p, `/app/today?booking=${ref}`);
  await until(async () => (await panelRef()) === ref, "panel opens");
  check("the panel opens for that booking, with the URL", p.url().endsWith(`/app/today?booking=${ref}`), p.url());
  check("and shows Total · Paid · Owes", /Total[\s\S]*Paid[\s\S]*Owes/i.test(await p.$eval("[data-money]", (d) => d.innerText)));
  const panelAction = await nextText("[data-next-action]");
  await p.keyboard.press("Escape");
  await until(async () => !(await p.$("[data-booking-panel]")) && p.url().endsWith("/app/today"), "Esc closes");
  check("Esc closes it and the URL goes back to Today", true);
  await go(p, `/app/today?booking=${ref}`);
  check("refreshing with the link opens the panel again", (await until(panelRef, "panel after refresh")) === ref);
  const id = await val("SELECT id FROM reservations WHERE reference = ?", ref);
  await go(p, `/app/reservations/${id}`);
  await waitForText(p, new RegExp(ref));
  const pageAction = await p.evaluate(() => {
    const b = [...document.querySelectorAll("a, button")].find((x) => /^(Take payment|Assign a room|Check in|Check out)/.test(x.textContent.trim()) && x.offsetParent);
    return b?.textContent.trim() ?? "";
  });
  check("the panel's next action is the booking page's", (panelAction ?? "") === "" ? pageAction === "" : panelAction.startsWith(pageAction.split(" ·")[0]), `${panelAction} | ${pageAction}`);

  await go(p, "/app/calendar");
  const bar = await p.$("[data-bar]");
  if (bar) {
    const barRef = await bar.evaluate((b) => b.getAttribute("data-reference"));
    const barHref = await bar.evaluate((b) => b.getAttribute("href"));
    await go(p, barHref);
    check("a calendar bar opens the panel", barHref.startsWith("/app/calendar") && barHref.includes(`booking=${barRef}`) && (await until(panelRef, "calendar panel")) === barRef, barHref);
  }

  await go(p, "/app/reservations?tab=all");
  const row = await p.$("table a[href*='booking=']");
  const rowHref = await row.evaluate((a) => a.getAttribute("href"));
  check("Bookings rows open the panel and keep the tab", /\/app\/reservations\?tab=all&booking=VL-/.test(rowHref), rowHref);
  await ctx.close();
}

{
  // I9: global search. Ctrl K; grouped results; bookings open the side panel; permissions; not on the till.
  const { ctx, p } = await as("front_desk");
  await p.setViewport({ width: 1366, height: 768 });
  const ref = await val("SELECT reference FROM reservations ORDER BY created_at DESC LIMIT 1");
  const room = await val("SELECT room_number FROM rooms WHERE is_active = 1 ORDER BY room_number LIMIT 1");
  await go(p, "/app/guests");
  await until(async () => {
    await p.keyboard.down("Control"); await p.keyboard.press("k"); await p.keyboard.up("Control");
    return Boolean(await p.$("[role=dialog][aria-label=Search] input"));
  }, "Ctrl K opens search");
  check("Ctrl K opens search", true);
  await p.type("[role=dialog][aria-label=Search] input", ref);
  await until(async () => (await p.$$eval("#global-search-results [role=option]", (o) => o.map((x) => x.textContent))).some((t) => t.includes(ref)), "booking found");
  check("results are grouped", /Bookings/.test(await p.$eval("#global-search-results", (l) => l.textContent)));
  await p.keyboard.press("Enter");
  await until(async () => p.url().includes(`booking=${ref}`) && Boolean(await p.$(`[data-panel-reference="${ref}"]`)), "booking panel from search");
  check("Enter on a booking opens its side panel", true);
  await go(p, "/app/today");
  await p.click("[data-global-search]");
  await p.type("[role=dialog][aria-label=Search] input", room);
  await until(async () => (await p.$$eval("#global-search-results [role=option]", (o) => o.map((x) => x.textContent))).some((t) => t.includes(`Room ${room}`)), "room found");
  await p.evaluate((r) => [...document.querySelectorAll("#global-search-results [role=option]")].find((o) => o.textContent.includes(`Room ${r}`)).click(), room);
  await until(async () => p.url().endsWith(`/app/rooms#room-${room}`), "room page");
  check("a room opens on the Rooms board", true);
  await ctx.close();

  const { ctx: c2, p: f } = await as("finance");
  await go(f, "/app/payments");
  check("finance has no global search (it can't open guests, bookings or rooms from its menu)", !(await f.$("[data-global-search]")));
  await c2.close();

  const { ctx: c3, p: b } = await as("restaurant_bar");
  await go(b, "/app/sales");
  await b.waitForSelector("[data-pay]");
  await b.keyboard.down("Control"); await b.keyboard.press("k"); await b.keyboard.up("Control");
  check("no global search on the till", !(await b.$("[data-global-search]")) && !(await b.$("[role=dialog][aria-label=Search]")));
  await c3.close();
}

{
  // I10: help on each screen, and "Your first day" on the account page.
  const { ctx, p } = await as("front_desk");
  await go(p, "/app/rooms");
  check("each screen says what it's for, under the title", await p.$eval("h1", (h) => (h.closest("div.min-w-0")?.querySelector(":scope > p")?.textContent ?? "").length > 20));
  await p.click("[data-help] summary");
  check("? opens the steps for the main task", /Mark a room clean[\s\S]*housekeeping/.test(await p.$eval("[data-help]", (d) => d.innerText)));
  await p.keyboard.press("Escape");
  check("Esc closes the help", !(await p.$eval("[data-help]", (d) => d.open)));
  await go(p, "/app/today");
  check("Today has help too", Boolean(await p.$("[data-help]")));

  await run("DELETE FROM staff_first_day WHERE staff_id IN (SELECT id FROM staff_profiles WHERE email LIKE '%frontdesk%' OR full_name LIKE 'E2E frontdesk%')").catch(() => {});
  await go(p, "/app/account");
  await p.waitForSelector("[data-first-day]");
  check("the front desk sees Your first day", /Take a walk-in[\s\S]*Mark a room clean/.test(await p.$eval("[data-first-day]", (c) => c.innerText)));
  await p.click("#fd-walk_in");
  await until(async () => (await val("SELECT count(*) FROM staff_first_day WHERE item = 'walk_in'")) > 0, "tick saved");
  await go(p, "/app/account");
  check("a tick is kept", await p.$eval("#fd-walk_in", (c) => c.checked));
  await ctx.close();
}

{
  // I11: initials beside guest names on Today, Bookings and the side panel.
  const { ctx, p } = await as("front_desk");
  await p.setViewport({ width: 1366, height: 768 });
  await go(p, "/app/today");
  const rows = await p.$$eval(".rounded-card ul > li:has(a[href*='booking=']):not([data-kind])", (l) => l.filter((x) => x.offsetParent).map((x) => Boolean(x.querySelector("[data-avatar]"))));
  check("Today's arriving and leaving rows show the guest's initials", rows.length > 0 && rows.every(Boolean), JSON.stringify(rows));
  await go(p, "/app/reservations?tab=all");
  check("so does every Bookings row", await p.$$eval("table tbody tr", (r) => r.filter((x) => x.offsetParent).every((x) => x.querySelector("[data-avatar]"))));
  const ref = await val("SELECT reference FROM reservations ORDER BY created_at DESC LIMIT 1");
  await go(p, `/app/reservations?tab=all&booking=${ref}`);
  await p.waitForSelector("[data-panel-reference] [data-avatar]");
  check("and the side panel", true);
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
