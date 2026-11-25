// Fix 4 / rule I10: a transfer at the till can't be confirmed without the reference and the bank-app tick.
import { as, check, clickText, finish, go, settle, text, val, waitForText } from "./lib.mjs";

const { ctx, p } = await as("restaurant_bar");
// A 1280×720 laptop with browser toolbars: the till must work without scrolling the page.
await p.setViewport({ width: 1280, height: 620 });
await go(p, "/app/sales");
await settle(p);
// The first menu item that can be sold.
const tile = await p.$("section[aria-label=Menu] li button:not([disabled])");
check("the till has something to sell", Boolean(tile));
await tile.click();
await clickText(p, "button", "Take payment");
await clickText(p, "button", "Transfer");
const confirm = async () => p.$$eval("button[type=submit]", (bs) => bs.find((b) => /^Confirm .* paid$/.test(b.innerText.trim()))?.disabled);
check("Confirm is off until there's a reference and the tick", (await confirm()) === true);
await p.type("input[name=transferReference]", "4821");
check("a reference alone isn't enough", (await confirm()) === true);
await p.click("input[name=transferChecked]");
check("reference and tick: Confirm is on", (await confirm()) === false);
check("at 1280×720 the till, with the Transfer fields open, fits without scrolling the page", (await p.evaluate(() => document.documentElement.scrollHeight - innerHeight)) <= 0);
check("the tick says a screenshot or SMS alert is not enough", /screenshot or SMS alert is not enough/.test(await text(p)));
const before = await val("SELECT count(*) FROM pos_orders WHERE transfer_reference = '4821'");
await clickText(p, "button", "Confirm");
await waitForText(p, /RB-\d{4}-\d{6}/);
check("the sale is saved with its transfer reference", (await val("SELECT count(*) FROM pos_orders WHERE transfer_reference = '4821' AND status = 'paid' AND method = 'bank_transfer'")) === before + 1);

// Fix 5: the cash count is blind. (Not submitted here: that would close this salesperson's day.)
await go(p, "/app/sales/closing");
await waitForText(p, /Your day/);
const page = await text(p);
const yourDay = page.slice(page.indexOf("Your day")).split(/Closings · last 14 days/i)[0];
check("closing names the business day and when it ends", /Business day \w{3} \d{1,2} \w{3} \(ends 06:00\)/.test(yourDay), yourDay.slice(0, 120));
check("no expected cash or money totals before the count", !/Cash expected|₦\s?[0-9]/.test(yourDay), JSON.stringify(yourDay.slice(0, 600)));
check("the count comes first", /Submit my count/.test(yourDay));
await ctx.close();

{
  // A reload (or power cut) mid-order: the till offers to bring the order back.
  const { ctx, p } = await as("restaurant_bar");
  await go(p, "/app/sales");
  const tiles = await p.$$("section[aria-label=Menu] li button:not([disabled])");
  await tiles[0].click();
  await tiles[1].click();
  await new Promise((r) => setTimeout(r, 300));
  await p.reload({ waitUntil: "load" });
  await waitForText(p, /Unfinished order from before the page reloaded: 2 items/);
  check("after a reload the till offers the unfinished order", true);
  await clickText(p, "button", "Bring it back");
  check("and brings it back", /Total · 2 items/.test(await text(p)));
  await clickText(p, "button", "Clear");
  await ctx.close();
}

{
  const { ctx, p } = await as("restaurant_bar_manager");
  await go(p, "/app/sales/reports?range=today");
  check("the manager sees it under Transfers to check, with the reference", /Transfers to check[\s\S]*4821/.test(await text(p)));
  await ctx.close();
}
await finish();
