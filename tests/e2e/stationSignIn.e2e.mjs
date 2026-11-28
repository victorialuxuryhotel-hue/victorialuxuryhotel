// Staff sign-in by name and PIN on a station (FUNCTIONALITY.md section 1): right PIN, wrong PIN, Lock keeps an
// open till order, switching user, and what the grid lists.
import { randomBytes } from "node:crypto";
import { as, check, clickText, enterPin, finish, go, one, pinStaff, run, session, settle, testStation, text, until, stationFor, val, waitForText } from "./lib.mjs";

const bar = await pinStaff("restaurant_bar");
const manager = await pinStaff("restaurant_bar_manager");
const desk = await pinStaff("front_desk");
const station = await testStation("bar", "signin-bar", manager.id);
const openSession = (staffId) => one("SELECT id, end_reason FROM staff_sessions WHERE station_id = ? AND staff_id = ? ORDER BY started_at DESC LIMIT 1", station.id, staffId);
const gridNames = (p) => p.$$eval("ul li button", (bs) => bs.filter((b) => b.offsetParent).map((b) => b.querySelector("span:nth-of-type(2)")?.textContent.trim()));

{
  // Without a station, /station is the managers' sign-in; a forged station cookie is no station.
  const { ctx, p } = await session();
  await go(p, "/station");
  check("no station: /station goes to the sign-in page", new URL(p.url()).pathname === "/login", p.url());
  await stationFor(p, { token: randomBytes(32).toString("base64url") });
  await go(p, "/station");
  check("a forged station cookie is sent to sign-in", new URL(p.url()).pathname === "/login", p.url());
  await go(p, "/app/today");
  check("and opens no staff page", !new URL(p.url()).pathname.startsWith("/app/today") || /locked|sign in/i.test(await text(p)), p.url());
  await ctx.close();
}

{
  const { ctx, p } = await session({ width: 1280, height: 720 });
  await stationFor(p, station);
  await go(p, "/station");
  await waitForText(p, /Locked\. Tap your name to start/);
  const names = await gridNames(p);
  check("the bar till lists restaurant & bar staff and their manager", names.includes(bar.fullName) && names.includes(manager.fullName), names.join(", "));
  check("and not the front desk", !names.includes(desk.fullName), names.join(", "));

  // Wrong PIN: refused, with the tries left; nothing starts.
  await enterPin(p, bar.fullName, "1357");
  await waitForText(p, /Wrong PIN\. \d tries left\./);
  check("a wrong PIN is refused and says how many tries are left", /Wrong PIN\. 4 tries left\./.test(await text(p)), await text(p).then((t) => t.slice(0, 200)));
  check("and starts no session", new URL(p.url()).pathname === "/station");
  check("the wrong try is recorded", (await val("SELECT ok FROM pin_attempts WHERE station_id = ? AND staff_id = ? ORDER BY id DESC LIMIT 1", station.id, bar.id)) === 0);

  // Right PIN: signed in, on the till, under their own name.
  await enterPin(p, bar.fullName, bar.pin);
  await p.waitForFunction(() => location.pathname.startsWith("/app"), { timeout: 30000 });
  await settle(p);
  check("the right PIN signs in and opens the till", new URL(p.url()).pathname === "/app/sales", p.url());
  const first = await openSession(bar.id);
  check("a staff session is open for that person on this station", first && first.end_reason === null, JSON.stringify(first));
  await p.waitForSelector("[data-pay]");

  // An order in progress, then Lock.
  await until(async () => {
    if (/Total · 1 item/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "item added", 15000);
  await clickText(p, "header button", "Lock");
  await p.waitForSelector("[role=dialog][aria-label=Locked]", { visible: true });
  check("Lock covers the screen with the name grid", /Tap your name to start/.test(await p.$eval("[role=dialog][aria-label=Locked]", (d) => d.innerText)));
  const locked = await until(async () => (await one("SELECT end_reason FROM staff_sessions WHERE id = ?", first.id))?.end_reason, "session ended");
  check("Lock ends the session on the server", locked === "lock", String(locked));
  await go(p, "/app/sales/orders").catch(() => {});
  check("with the session ended, staff pages go back to the name grid", new URL(p.url()).pathname === "/station" || Boolean(await p.$("[role=dialog][aria-label=Locked]")), p.url());
  await ctx.close();
}

{
  // Lock and sign back in (same person), then switch user: the open order stays each time.
  const { ctx, p } = await as("restaurant_bar", { station: "signin-bar", viewport: { width: 1280, height: 720 } });
  await go(p, "/app/sales");
  await p.waitForSelector("[data-pay]");
  await until(async () => {
    if (/Total · 2 items/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "two items added", 15000);
  await clickText(p, "header button", "Lock");
  await p.waitForSelector("[role=dialog][aria-label=Locked]", { visible: true });
  await enterPin(p, bar.fullName, bar.pin);
  await until(async () => !(await p.$("[role=dialog][aria-label=Locked]")), "lock gone");
  check("signing back in after Lock keeps the open till order", /Total · 2 items/.test(await text(p)));

  const before = await openSession(bar.id);
  await clickText(p, "header button", "Lock");
  await p.waitForSelector("[role=dialog][aria-label=Locked]", { visible: true });
  await enterPin(p, manager.fullName, manager.pin);
  await until(async () => !(await p.$("[role=dialog][aria-label=Locked]")), "lock gone");
  await settle(p);
  check("switching user keeps the order on screen", /Total · 2 items/.test(await text(p)));
  const strip = await until(() => p.evaluate(() => document.querySelector("header")?.innerText ?? ""), "till bar");
  check("and the till now shows the manager", strip.includes(manager.fullName.split(" ")[0]) && !strip.includes(" Bar Staff"), strip.replace(/\s+/g, " "));
  check("the first person's session ended, the manager's is open", (await one("SELECT end_reason FROM staff_sessions WHERE id = ?", before.id))?.end_reason === "lock" && (await openSession(manager.id))?.end_reason === null);
  await clickText(p, "button", "Clear");
  await ctx.close();
}

{
  // The desk: the account menu has Lock screen and Switch user (no Sign out); a deactivated person is signed out.
  const { ctx, p, acc } = await as("front_desk", { station: "signin-desk" });
  check("the desk opens on a staff page", new URL(p.url()).pathname.startsWith("/app"), p.url());
  await clickText(p, "button[aria-label='Account menu']", acc.fullName);
  const menu = await until(() => p.evaluate(() => [...document.querySelectorAll("[role=menu]")].map((m) => m.innerText).join(" ")), "account menu");
  check("on a station the account menu offers Lock screen and Switch user, not Sign out", /Lock screen/.test(menu) && /Switch user/.test(menu) && !/Sign out/.test(menu), menu.replace(/\s+/g, " "));
  await p.keyboard.press("Escape");
  const sid = await val("SELECT id FROM staff_sessions WHERE station_id = ? AND staff_id = ? AND ended_at IS NULL", acc.station.id, acc.id);
  await run("UPDATE staff_profiles SET is_active = 0 WHERE id = ?", acc.id);
  check("deactivating someone ends their session at once", (await val("SELECT end_reason FROM staff_sessions WHERE id = ?", sid)) === "deactivated");
  await go(p, "/app/today");
  check("and their next page is the name grid", new URL(p.url()).pathname === "/station", p.url());
  check("where they are no longer listed", !(await gridNames(p)).includes(acc.fullName));
  await pinStaff("front_desk"); // active again for the other tests
  await ctx.close();
}

await finish();
