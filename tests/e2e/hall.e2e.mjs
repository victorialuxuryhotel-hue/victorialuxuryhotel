// Fix 8: a hall booking starts as an enquiry (confirmed only when paid in full), and an error keeps what was typed.
import { as, check, clickText, fill, finish, go, settle, waitForText } from "./lib.mjs";

const d = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
const { ctx, p } = await as("front_desk");
await go(p, "/app/events");
await settle(p);
check("there's no status choice: confirmed means paid in full", !(await p.$("#hstatus")));
await fill(p, "#htitle", "Board meeting E2E");
await fill(p, "#hname", "Ondo Co-op");
await p.$eval("#hdate", (e, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
  e.dispatchEvent(new Event("input", { bubbles: true }));
}, d);
await p.$eval("#hstart", (e) => (e.value = "15:00"));
await p.$eval("#hend", (e) => (e.value = "10:00"));
await fill(p, "#hprice", "250000");
await clickText(p, "button", "Save hall booking");
await waitForText(p, /end time must be after the start time/);
const kept = await p.evaluate(() => ["#htitle", "#hname", "#hdate", "#hprice"].map((s) => document.querySelector(s)?.value));
check("after an error the form keeps what was typed", JSON.stringify(kept) === JSON.stringify(["Board meeting E2E", "Ondo Co-op", d, "250000"]), JSON.stringify(kept));
await ctx.close();
await finish();
