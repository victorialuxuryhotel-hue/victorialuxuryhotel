// Screenshots of the main staff screens at the stations' sizes, for review (hardware brief H7, UX brief).
// Run with the dev server up:  node --env-file=.env.local scripts/screens.mjs
// Saves docs/screens/<screen>-<width>x<height>.png and prints whether each page scrolls.
// Note: it makes one cash sale at the till (to show the payment step and the receipt).
import { mkdirSync } from "node:fs";
import { as, clickText, go, settle, text, until, val } from "../tests/e2e/lib.mjs";

const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });

// Bar terminal: Chrome kiosk, no toolbars. Front desk: a normal Chrome window (~100px of toolbars).
const BAR = [[1280, 720]];
const DESK = [[1366, 668], [1920, 980]];
const booking = await val("SELECT id FROM reservations WHERE status = 'checked_in' ORDER BY check_out LIMIT 1");

const shot = async (p, name, width, height) => {
  const scroll = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await p.screenshot({ path: `${OUT}/${name}-${width}x${height}.png` });
  console.log(`${name} ${width}x${height}: ${scroll > 0 ? `page scrolls ${scroll}px` : "fits, no page scroll"}`);
};

for (const [width, height] of DESK) {
  for (const [name, path] of [["today", "/app/today"], ["booking", `/app/reservations/${booking}`], ["room-board", "/app/rooms"]]) {
    const { ctx, p } = await as("front_desk");
    await p.setViewport({ width, height });
    await go(p, path);
    await settle(p);
    await shot(p, name, width, height);
    await ctx.close();
  }
}

// Interface brief (I1–I11): the screens it names, at the sizes it names.
const INTERFACE = [[1366, 768], [1920, 1080]];
const reference = await val("SELECT reference FROM reservations WHERE status = 'checked_in' ORDER BY check_out LIMIT 1");
for (const [width, height] of INTERFACE) {
  for (const [name, role, path] of [
    ["today", "front_desk", "/app/today"],
    ["calendar", "front_desk", "/app/calendar"],
    ["side-panel", "front_desk", `/app/calendar?booking=${reference}`],
    ["payments-to-confirm", "general_manager", "/app/payments/confirm"],
    ["dashboard", "general_manager", "/app"],
  ]) {
    const { ctx, p } = await as(role);
    await p.setViewport({ width, height });
    await go(p, path);
    await settle(p);
    await shot(p, `i-${name}`, width, height);
    await ctx.close();
  }
}

for (const [width, height] of BAR) {
  const { ctx, p } = await as("restaurant_bar");
  await p.setViewport({ width, height });
  await p.evaluateOnNewDocument(() => { window.print = () => {}; });
  await go(p, "/app/sales");
  await settle(p);
  await shot(p, "till", width, height);
  await until(async () => {
    if (/Total · 1 item/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "item added", 10000);
  // I8: a note on the line ("No ice"), with the Pay button pinned.
  await p.click("#order li button[aria-expanded]");
  await clickText(p, "[data-note-editor] button", "No ice");
  await shot(p, "till-note", width, height);
  await clickText(p, "[data-note-editor] button", "Done");
  await p.click("[data-pay]");
  await clickText(p, "button", "Exact");
  await shot(p, "till-payment", width, height);
  await clickText(p, "button", "Confirm");
  await until(async () => /Give change/.test(await text(p)), "receipt", 20000);
  await shot(p, "till-receipt", width, height);
  await go(p, "/app/sales/closing");
  await settle(p);
  await shot(p, "closing", width, height);
  await ctx.close();
}
process.exit(0);
