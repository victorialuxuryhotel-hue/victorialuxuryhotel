// Screenshots of the main staff screens at laptop sizes, for review (docs/ux-brief-2026-11-25.md).
// Run with the dev server up:  node --env-file=.env.local scripts/screens.mjs
// Saves docs/screens/<screen>-<width>x<height>.png and prints whether each page scrolls.
import { mkdirSync } from "node:fs";
import { as, go, settle, val } from "../tests/e2e/lib.mjs";

const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });
// The usable height of a 1366×768 / 1280×720 laptop with browser toolbars (~100px).
const SIZES = [[1366, 668], [1280, 620]];
const booking = await val("SELECT id FROM reservations WHERE status = 'checked_in' ORDER BY check_out LIMIT 1");
const screens = [
  ["front_desk", "today", "/app/today"],
  ["front_desk", "booking", `/app/reservations/${booking}`],
  ["front_desk", "room-board", "/app/rooms"],
  ["restaurant_bar", "till", "/app/sales"],
  ["restaurant_bar", "closing", "/app/sales/closing"],
];

for (const [width, height] of SIZES) {
  for (const [role, name, path] of screens) {
    const { ctx, p } = await as(role);
    await p.setViewport({ width, height });
    await go(p, path);
    await settle(p);
    const scroll = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    await p.screenshot({ path: `${OUT}/${name}-${width}x${height}.png` });
    console.log(`${name} ${width}x${height}: ${scroll > 0 ? `page scrolls ${scroll}px` : "fits, no page scroll"}`);
    await ctx.close();
  }
}
process.exit(0);
