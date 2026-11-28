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
await waitForText(p, /Close my day/);
const page = await text(p);
const yourDay = page.slice(page.indexOf("Close my day")).split(/Your closings/i)[0];
check("closing names the business day", /business day \w{3} \d{1,2} \w{3}/.test(yourDay), yourDay.slice(0, 120));
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
  const payDisabled = () => p.$eval("[data-pay]", (b) => b.disabled);
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
  // 8 seconds: long enough to add the item on a busy dev server (no waiting for the network to settle), short enough for a test.
  await p.evaluate(() => localStorage.setItem("victoria-idle-lock-ms", "8000"));
  await p.reload({ waitUntil: "load" });
  // Tap until the item is in the order (a tap before the page has finished loading does nothing).
  await until(async () => {
    if (/Total · 1 item/.test(await text(p))) return true;
    await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, "item added", 10000);
  await waitForText(p, /Locked/, 20000);
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
// I8: till improvements, on the bar terminal (1280×720) as a restaurant & bar attendant.
{
  const { ctx: c8, p: t } = await as("restaurant_bar");
  await t.setViewport({ width: 1280, height: 720 });
  await t.evaluate(() => localStorage.setItem("victoria-station", JSON.stringify({ counter: "bar", printLayout: "none", autoPrint: false })));
  await go(t, "/app/sales");
  await t.waitForSelector("[data-pay]");
  check("full-screen till: no sidebar for restaurant & bar staff", await t.$$eval("[data-app-nav]", (n) => n.every((x) => !x.offsetParent)));
  check("the strip keeps Orders & receipts and Close my day", /Orders & receipts[\s\S]*Close my day/.test(await text(t)));
  const pay = await t.$eval("[data-pay]", (b) => {
    const cs = getComputedStyle(b.parentElement);
    return { h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, parent: b.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  check("Pay is full width and at least 56px tall", pay.h >= 56 && pay.w >= pay.parent - 1, JSON.stringify(pay));

  // A bar item without stock tracking says "Made to order"; search finds it.
  const plain = await val("SELECT m.name FROM menu_items m WHERE m.outlet = 'bar' AND m.is_active = 1 AND m.is_available = 1 AND NOT EXISTS (SELECT 1 FROM menu_item_stock l WHERE l.menu_item_id = m.id) LIMIT 1");
  const tracked = await val("SELECT m.name FROM menu_items m WHERE m.outlet = 'bar' AND m.is_active = 1 AND EXISTS (SELECT 1 FROM menu_item_stock l WHERE l.menu_item_id = m.id) LIMIT 1");
  const tileText = (name) => t.$$eval("section[aria-label=Menu] li button", (bs, n) => bs.find((b) => b.innerText.startsWith(n))?.innerText ?? null, name);
  if (plain) check("an item without stock says Made to order", /Made to order/.test((await tileText(plain)) ?? ""), plain);
  if (tracked) check("a stocked item doesn't", !/Made to order/.test((await tileText(tracked)) ?? "Made to order"), tracked);
  const item = plain ?? tracked;
  await t.type("[data-till-search]", item.slice(0, 4));
  const names = await t.$$eval("section[aria-label=Menu] ul.grid > li > button", (bs) => bs.map((b) => b.innerText.split("\n")[0]));
  check("search shows only matching items", names.length > 0 && names.every((n) => n.toLowerCase().includes(item.slice(0, 4).toLowerCase())), names.join(", "));

  // A note on a line, saved, then Same again.
  await t.evaluate((n) => [...document.querySelectorAll("section[aria-label=Menu] li button")].find((b) => b.innerText.startsWith(n))?.click(), item);
  await t.click(`[data-line="${item}"] button[aria-expanded]`);
  await clickText(t, "[data-note-editor] button", "No ice");
  await clickText(t, "[data-note-editor] button", "Done");
  check("the line shows its note", /No ice/.test(await t.$eval(`[data-line="${item}"]`, (l) => l.innerText)));
  const before = await val("SELECT count(*) FROM pos_orders WHERE status = 'open'");
  await clickText(t, "button", "Save as unpaid order");
  await until(async () => (await val("SELECT count(*) FROM pos_orders WHERE status = 'open'")) === before + 1, "order saved");
  const orderId = await val("SELECT id FROM pos_orders WHERE status = 'open' ORDER BY created_at DESC LIMIT 1");
  check("the note is saved on the line", (await val("SELECT note FROM pos_order_items WHERE order_id = ?", orderId)) === "No ice");
  await go(t, `/app/sales?order=${orderId}`);
  await t.waitForSelector("[data-same-again]");
  await t.click("[data-same-again]");
  const qty = await t.$eval(`[data-line="${item}"] [aria-live]`, (s) => s.textContent);
  check("Same again adds the last round again (with its note)", qty === "2", qty);

  // Pay it in cash; the receipt prints the note under the item.
  await t.click("[data-pay]");
  await clickText(t, "button", "Exact");
  await clickText(t, "button", "Confirm");
  await waitForText(t, /RB-\d{4}-\d{6}/);
  check("the receipt prints the note under the item", await t.$$eval(".pos-receipt", (r) => r.some((x) => /– No ice/.test(x.textContent))));
  check("the paid order has 2 on the noted line", (await val("SELECT quantity FROM pos_order_items WHERE order_id = ? AND note = 'No ice'", orderId)) === 2);

  // Dark till: a station setting, off by default.
  check("the till isn't dark unless the station says so", !(await t.evaluate(() => "tillDark" in document.documentElement.dataset)));
  await t.evaluate(() => localStorage.setItem("victoria-station", JSON.stringify({ counter: "bar", printLayout: "none", autoPrint: false, tillDark: true })));
  await go(t, "/app/sales");
  await t.waitForSelector("[data-pay]");
  check("dark till when the station says so", await t.evaluate(() => "tillDark" in document.documentElement.dataset));
  await go(t, "/app/sales/orders");
  check("and only on the till", !(await t.evaluate(() => "tillDark" in document.documentElement.dataset || "tillFull" in document.documentElement.dataset)));
  await t.evaluate(() => localStorage.removeItem("victoria-station"));
  await c8.close();
}

await finish();
