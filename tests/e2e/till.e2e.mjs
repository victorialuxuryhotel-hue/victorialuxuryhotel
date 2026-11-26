// Fix 4 / rule I10: a transfer at the till can't be confirmed without the reference and the bank-app tick.
import { as, check, clickText, finish, go, settle, text, until, val, waitForText } from "./lib.mjs";

const { ctx, p } = await as("restaurant_bar");
// The bar terminal: 1280×720 in Chrome kiosk (no toolbars), hardware brief H7. The till must work without scrolling the page.
await p.setViewport({ width: 1280, height: 720 });
await go(p, "/app/sales");
// I5: the business day in the till's top strip ("(until 06:00)" after midnight).
{
  const label = await until(() => p.evaluate(() => document.querySelector("main [data-business-day], [data-business-day]")?.textContent ?? null), "business day shown");
  const want = await val("SELECT strftime('%d', date('now', '-5 hours'))");
  check("the till shows the business day", /^Business day · \w{3} \d{1,2} \w{3}( \(until 06:00\))?$/.test(label) && label.includes(` ${Number(want)} `), label);
}
await settle(p);
// The first menu item that can be sold.
const tile = await p.$("section[aria-label=Menu] li button:not([disabled])");
check("the till has something to sell", Boolean(tile));
await tile.click();
await clickText(p, "button", "Take payment");
await clickText(p, "button", "Transfer");
const confirm = async () => p.$$eval("button[type=submit]", (bs) => bs.find((b) => /^Confirm .* paid$/.test(b.innerText.trim()))?.disabled);
check("Confirm is off until there's a reference and the tick", (await confirm()) === true);
await p.type("input[name=paymentReference]", "4821");
check("a reference alone isn't enough", (await confirm()) === true);
await p.click("input[name=transferChecked]");
check("reference and tick: Confirm is on", (await confirm()) === false);
check("at 1280×720 the till, with the Transfer fields open, fits without scrolling the page", (await p.evaluate(() => document.documentElement.scrollHeight - innerHeight)) <= 0);
check("the tick says a screenshot or SMS alert is not enough", /screenshot or SMS alert is not enough/.test(await text(p)));
const before = await val("SELECT count(*) FROM pos_orders WHERE payment_reference = '4821'");
await clickText(p, "button", "Confirm");
await waitForText(p, /RB-\d{4}-\d{6}/);
check("the sale is saved with its transfer reference", (await val("SELECT count(*) FROM pos_orders WHERE payment_reference = '4821' AND status = 'paid' AND method = 'bank_transfer'")) === before + 1);

// H1: a POS/card sale needs the last 4 digits of the slip.
await clickText(p, "button", "New order");
const tile2 = await p.$("section[aria-label=Menu] li button:not([disabled])");
await tile2.click();
await clickText(p, "button", "Take payment");
await clickText(p, "button", "POS / card");
check("POS: Confirm is off until the slip's 4 digits are in", (await confirm()) === true);
// H4: entered on the on-screen keypad (taps only), never the Windows keyboard.
for (const k of ["7", "7", "3", "1", "9"]) await p.click(`[role=group][aria-label="Number pad for the POS slip"] button[aria-label="${k}"]`);
const slip = await p.$eval("input[name=paymentReference]", (e) => e.value);
check("the keypad enters the slip, 4 digits at most", slip === "7731" && (await confirm()) === false, `${slip} confirm-disabled=${await confirm()}`);
check("the slip field doesn't open the touch keyboard", (await p.$eval("input[name=paymentReference]", (e) => e.inputMode)) === "none");
check("Confirm is on screen at 1280×720 with the keypad open", await p.$$eval("button[type=submit]", (bs) => {
  const b = bs.find((x) => /^Confirm .* paid$/.test(x.innerText.trim()));
  const r = b?.getBoundingClientRect();
  return Boolean(r && r.top >= 0 && r.bottom <= innerHeight);
}));
await clickText(p, "button", "Confirm");
await waitForText(p, /slip …7731/);
check("the receipt shows the POS slip", /POS \/ card · slip …7731/.test(await text(p)));

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
  // H9: losing the connection shows the banner and turns Pay off until it's back.
  const { ctx, p } = await as("restaurant_bar");
  await p.setViewport({ width: 1280, height: 720 });
  await go(p, "/app/sales");
  await settle(p);
  await until(async () => {
    if (/Total · 1 item/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "item added", 10000);
  const payDisabled = () => p.$$eval("button", (bs) => bs.find((b) => b.innerText.trim() === "Take payment")?.disabled);
  await p.setOfflineMode(true);
  await waitForText(p, /No internet connection\. Your last action may not have saved/);
  check("offline: the banner says don't take payment", /Don't take payment until this clears/.test(await text(p)));
  check("offline: Take payment is off", (await payDisabled()) === true);
  await p.setOfflineMode(false);
  await until(async () => !/No internet connection/.test(await text(p)), "back online", 10000);
  check("back online: the banner goes and Take payment is on again", (await payDisabled()) === false);
  await clickText(p, "button", "Clear");
  await ctx.close();
}

{
  // H5: this station prints 80mm receipts automatically, once per receipt.
  const { ctx, p } = await as("restaurant_bar");
  await p.setViewport({ width: 1280, height: 720 });
  await p.evaluateOnNewDocument(() => {
    window.__prints = 0;
    window.print = () => { window.__prints++; };
  });
  await go(p, "/app/station");
  await clickText(p, "button", "80mm receipt printer");
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("victoria-station") ?? "{}"));
  check("This station saves 80mm with auto-print on", saved.printLayout === "80mm" && saved.autoPrint === true, JSON.stringify(saved));
  await go(p, "/app/sales");
  await settle(p);
  await until(async () => {
    if (/Total · 1 item/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "item added", 10000);
  await clickText(p, "button", "Take payment");
  await clickText(p, "button", "Exact");
  await clickText(p, "button", "Confirm");
  await waitForText(p, /Give change/);
  await new Promise((r) => setTimeout(r, 500));
  await clickText(p, "button", "Best sellers").catch(() => {}); // any re-render
  check("the receipt printed automatically, exactly once", (await p.evaluate(() => window.__prints)) === 1, String(await p.evaluate(() => window.__prints)));
  await p.evaluate(() => localStorage.removeItem("victoria-station"));
  await ctx.close();
}

{
  // H3: the idle lock covers the screen; Continue brings back the same order. (Idle time shortened for the test.)
  const { ctx, p } = await as("restaurant_bar");
  await go(p, "/app/sales");
  check("the till shows who is signed in, with Switch user", /Signed in as .+ \(.+\)\s*Switch user/.test(await text(p)));
  await p.evaluate(() => localStorage.setItem("victoria-idle-lock-ms", "4000"));
  await p.reload({ waitUntil: "load" });
  await settle(p);
  // Tap until the item is in the order (a tap before the page has finished loading does nothing).
  await until(async () => {
    if (/Total · 1 item/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "item added", 10000);
  await waitForText(p, /Locked/, 15000);
  check("after the idle time the screen locks", Boolean(await p.$("[role=dialog][aria-modal=true]")));
  // Back to the normal idle time before continuing, so the lock doesn't come straight back.
  await p.evaluate(() => localStorage.removeItem("victoria-idle-lock-ms"));
  await clickText(p, "button", "Continue as");
  check("Continue brings back the order being taken", /Total · 1 item/.test(await text(p)));
  await clickText(p, "button", "Clear");
  await ctx.close();
}

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
  check("the manager sees it under Transfers to check, with the reference", /Transfers and POS payments to check[\s\S]*4821/.test(await text(p)));
  await ctx.close();
}
await finish();
