// Prints each document at 80mm and A4 to PDF, the way Chrome would on that station (hardware brief H6).
// Run with the dev server up:  node --env-file=.env.local scripts/print-pdfs.mjs
// Saves docs/screens/print/<document>-<80mm|a4>.pdf and prints each PDF's page size and page count.
import { mkdirSync, writeFileSync } from "node:fs";
import { as, go, settle, val } from "../tests/e2e/lib.mjs";

const OUT = "docs/screens/print";
mkdirSync(OUT, { recursive: true });
const order = await val("SELECT id FROM pos_orders WHERE status = 'paid' ORDER BY paid_at DESC LIMIT 1");
const receipt = await val("SELECT receipt_number FROM payments WHERE status = 'successful' AND kind = 'payment' AND receipt_number IS NOT NULL ORDER BY paid_at DESC LIMIT 1");
const stay = await val("SELECT id FROM reservations WHERE status IN ('checked_in', 'confirmed') ORDER BY check_in DESC LIMIT 1");
const hall = await val("SELECT id FROM hall_bookings ORDER BY created_at DESC LIMIT 1");
const docs = [
  ["restaurant_bar_manager", "bar-receipt", `/app/sales/orders/${order}`],
  ["front_desk", "desk-receipt", `/app/payments/receipt/${receipt}`],
  ["front_desk", "guest-bill", `/app/reservations/${stay}/bill`],
  ["front_desk", "hall-invoice", `/app/events/${hall}/invoice`],
];

const info = (buf) => {
  const s = buf.toString("latin1");
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(s);
  const mm = (pt) => Math.round((Number(pt) / 72) * 25.4);
  return `${box ? `${mm(box[1])}×${mm(box[2])}mm` : "?"}, ${(s.match(/\/Type\s*\/Page[^s]/g) ?? []).length} page(s)`;
};

for (const [role, name, path] of docs) {
  for (const layout of ["80mm", "a4"]) {
    const { ctx, p } = await as(role);
    await go(p, "/app/station");
    await p.evaluate((l) => localStorage.setItem("victoria-station", JSON.stringify({ counter: null, printLayout: l, autoPrint: false })), layout);
    await go(p, path);
    await settle(p);
    const pdf = Buffer.from(await p.pdf({ preferCSSPageSize: true, printBackground: true }));
    writeFileSync(`${OUT}/${name}-${layout}.pdf`, pdf);
    console.log(`${name} at ${layout}: ${info(pdf)}`);
    await ctx.close();
  }
}
process.exit(0);
