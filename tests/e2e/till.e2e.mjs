// The till on the bar terminal (1280×720, kiosk), signed in by name and PIN on a bar station.
// Fix 4 / rule I10: a transfer can't be confirmed without the reference and the bank-app tick; H1: POS needs 4 slip digits.
import { as, check, choose, clickText, enterPin, finish, go, one, pinStaff, settle, text, until, val, waitForText } from "./lib.mjs";

const TERMINAL = { width: 1280, height: 720 };
const confirmOff = (p) => p.$$eval("button[type=submit]", (bs) => bs.find((b) => /^Confirm .* paid$/.test(b.innerText.trim()))?.disabled);
/** Taps the first item that can be sold until the order has `n` items (a tap before the page has hydrated does nothing). */
const addItems = (p, n = 1) =>
  until(async () => {
    if (new RegExp(`Total · ${n} items?`).test(await text(p))) return true;
    const count = Number((await text(p)).match(/Total · (\d+) item/)?.[1] ?? 0);
    if (count < n) await p.click("section[aria-label=Menu] li button:not([disabled])").catch(() => {});
    return false;
  }, `${n} item(s) added`, 15000);

const ref = String(Date.now()).slice(-6);
{
  const { ctx, p } = await as("restaurant_bar", { viewport: TERMINAL });
  await go(p, "/app/sales");
  await p.waitForSelector("[data-pay]");
  // I5: the business day in the till bar ("Business day Sat 28 Nov (ends 06:00)").
  const bar = await p.$eval("header", (h) => h.innerText);
  const want = await val("SELECT strftime('%d', date('now', '+1 hour', '-6 hours'))");
  check("the till bar shows the business day", new RegExp(`Business day \\w{3} ${Number(want)} \\w{3} \\(ends 06:00\\)`).test(bar), bar.replace(/\s+/g, " "));
  check("and who is signed in, with Lock", /Bar[\s\S]*Lock/.test(bar) && bar.includes("E2E"), bar.replace(/\s+/g, " "));

  await addItems(p, 1);
  await p.click("[data-pay]");
  await choose(p, "Transfer");
  await p.waitForSelector("input[name=paymentReference]");
  check("Confirm is off until there's a reference and the tick", (await confirmOff(p)) === true);
  await p.type("input[name=paymentReference]", ref);
  check("a reference alone isn't enough", (await confirmOff(p)) === true);
  await p.click("input[name=transferChecked]");
  check("reference and tick: Confirm is on", (await confirmOff(p)) === false);
  check("at 1280×720 the till, with the Transfer fields open, fits without scrolling the page", (await p.evaluate(() => document.documentElement.scrollHeight - innerHeight)) <= 0);
  check("the tick warns that the customer's phone is not proof", /Never on the customer.s phone/.test(await text(p)));
  await clickText(p, "button[type=submit]", "Confirm");
  await waitForText(p, /RB-\d{4}-\d{6}/);
  const sale = await one("SELECT status, method, seen_in_bank_app, paid_by FROM pos_orders WHERE payment_reference = ? ORDER BY created_at DESC LIMIT 1", ref);
  check("the sale is saved with its transfer reference and the tick", sale?.status === "paid" && sale?.method === "bank_transfer" && sale?.seen_in_bank_app === 1, JSON.stringify(sale));
  check("and against the person signed in with their PIN", sale?.paid_by === (await val("SELECT id FROM staff_profiles WHERE email = 'e2e-pin-bar@victoria.test'")));

  // H1: a POS/card sale needs the last 4 digits of the slip, entered on the on-screen keypad (taps only).
  await clickText(p, "button", "New order");
  await addItems(p, 1);
  await p.click("[data-pay]");
  await choose(p, "POS / card");
  await p.waitForSelector("input[name=slipLast4]");
  check("POS: Confirm is off until the slip's 4 digits are in", (await confirmOff(p)) === true);
  for (const k of ["7", "7", "3", "1", "9"]) await p.click(`[role=group][aria-label="Number pad for the POS slip"] button[aria-label="${k}"]`);
  const slip = await p.$eval("input[name=slipLast4]", (e) => e.value);
  check("the keypad enters the slip, 4 digits at most", slip === "7731" && (await confirmOff(p)) === false, `${slip} confirm-disabled=${await confirmOff(p)}`);
  check("the slip field doesn't open the touch keyboard", (await p.$eval("input[name=slipLast4]", (e) => e.inputMode)) === "none");
  check("there's a terminal to choose", Boolean(await p.$("select[name=terminal] option")));
  check("Confirm is on screen at 1280×720 with the keypad open", await p.$$eval("button[type=submit]", (bs) => {
    const b = bs.find((x) => /^Confirm .* paid$/.test(x.innerText.trim()));
    const r = b?.getBoundingClientRect();
    return Boolean(r && r.top >= 0 && r.bottom <= innerHeight);
  }));
  await clickText(p, "button[type=submit]", "Confirm");
  await waitForText(p, /slip …7731/);
  check("the receipt shows the POS slip", /POS \/ card · slip …7731/.test(await text(p)));

  // Fix 5: the cash count is blind. (Not submitted here: that would close this salesperson's day.)
  await go(p, "/app/sales/closing");
  await waitForText(p, /Close my day/);
  const page = await text(p);
  const yourDay = page.slice(page.indexOf("Close my day")).split(/Submit my count/)[0];
  check("closing names the business day", /business day \w{3} \d{1,2} \w{3}/i.test(yourDay), yourDay.slice(0, 120));
  check("no expected cash before the count", !/Cash expected|Expected/i.test(yourDay), JSON.stringify(yourDay.slice(0, 600)));
  check("the count comes first", /Submit my count/.test(page));
  await ctx.close();
}

{
  // H9: losing the connection shows the banner and turns Pay off until it's back.
  const { ctx, p } = await as("restaurant_bar", { viewport: TERMINAL });
  await go(p, "/app/sales");
  await p.waitForSelector("[data-pay]");
  await addItems(p, 1);
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
  const { ctx, p } = await as("restaurant_bar", { viewport: TERMINAL });
  await p.evaluateOnNewDocument(() => {
    window.__prints = 0;
    window.print = () => { window.__prints++; };
  });
  await go(p, "/app/station");
  await p.waitForSelector("#st-print");
  await p.select("#st-print", "80mm");
  const saved = await until(() => p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("victoria-station") ?? "{}");
    return s.printLayout === "80mm" ? s : null;
  }), "station saved").catch(() => ({}));
  check("This station saves 80mm with auto-print on", saved.printLayout === "80mm" && saved.autoPrint === true, JSON.stringify(saved));
  await go(p, "/app/sales");
  await p.waitForSelector("[data-pay]");
  await addItems(p, 1);
  await p.click("[data-pay]");
  await clickText(p, "button", "Exact");
  await clickText(p, "button[type=submit]", "Confirm");
  await waitForText(p, /Give change/);
  await new Promise((r) => setTimeout(r, 500));
  await p.click("section[aria-label=Menu] [role=tablist] button").catch(() => {}); // any re-render
  check("the receipt printed automatically, exactly once", (await p.evaluate(() => window.__prints)) === 1, String(await p.evaluate(() => window.__prints)));
  await p.evaluate(() => localStorage.removeItem("victoria-station"));
  await ctx.close();
}

{
  // H3 on a station: the idle lock ends the session and shows the name grid over the till; the PIN brings back the same order.
  const { ctx, p, acc } = await as("restaurant_bar", { viewport: TERMINAL });
  await go(p, "/app/sales");
  // 8 seconds: long enough to add the item on a busy dev server, short enough for a test.
  await p.evaluate(() => localStorage.setItem("victoria-idle-lock-ms", "8000"));
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector("[data-pay]");
  await addItems(p, 1);
  await p.waitForSelector("[role=dialog][aria-label=Locked]", { visible: true, timeout: 30000 });
  check("after the idle time the screen locks with the name grid", /Tap your name to start/.test(await p.$eval("[role=dialog][aria-label=Locked]", (d) => d.innerText)));
  const ended = await until(() => val("SELECT end_reason FROM staff_sessions WHERE station_id = ? AND staff_id = ? ORDER BY started_at DESC LIMIT 1", acc.station.id, acc.id), "session ended");
  check("the idle lock ends the session on the server", ended === "idle", String(ended));
  // Back to the normal idle time before signing in again, so the lock doesn't come straight back.
  await p.evaluate(() => localStorage.removeItem("victoria-idle-lock-ms"));
  await enterPin(p, acc.fullName, acc.pin);
  await until(async () => !(await p.$("[role=dialog][aria-label=Locked]")), "unlocked");
  check("signing in again brings back the order being taken", /Total · 1 item/.test(await text(p)));
  await clickText(p, "button", "Clear");
  await ctx.close();
}

{
  // A reload (or power cut) mid-order: the till offers to bring the order back.
  const { ctx, p } = await as("restaurant_bar", { viewport: TERMINAL });
  await go(p, "/app/sales");
  await p.waitForSelector("[data-pay]");
  await addItems(p, 2);
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
  // X9: a void needs a reason, the cash-returned tick, and a manager's PIN on the same screen; the seller stays signed in.
  const manager = await pinStaff("restaurant_bar_manager");
  const { ctx, p, acc } = await as("restaurant_bar", { viewport: TERMINAL });
  await go(p, "/app/sales");
  await p.waitForSelector("[data-pay]");
  await addItems(p, 1);
  await p.click("[data-pay]");
  await clickText(p, "button", "Exact");
  await clickText(p, "button[type=submit]", "Confirm");
  await waitForText(p, /Give change/);
  const orderId = await val("SELECT id FROM pos_orders WHERE paid_by = ? AND status = 'paid' AND method = 'cash' ORDER BY paid_at DESC LIMIT 1", acc.id);
  await go(p, `/app/sales/orders/${orderId}`);
  await clickText(p, "button", "Void sale");
  const voidOff = () => p.$$eval("button", (bs) => bs.find((b) => /^Void ₦/.test(b.innerText.trim()))?.disabled);
  check("Void is off until cash returned is ticked and a manager approves", (await voidOff()) === true);
  await clickText(p, "label", "Cash returned to the customer");
  check("still off without the manager's PIN", (await voidOff()) === true);
  const approvers = await p.$$eval("button[aria-pressed]", (bs) => bs.map((b) => b.innerText.trim()));
  check("the seller can't approve their own void", approvers.includes(manager.fullName) && !approvers.includes(acc.fullName), approvers.join(", "));
  await clickText(p, "button[aria-pressed]", manager.fullName);
  const pad = (d) => p.click(`[role=group][aria-label="Number pad for the manager's PIN"] button[aria-label="${d}"]`);
  for (const d of "1357") await pad(d);
  await clickText(p, "button", "Void ₦");
  await waitForText(p, /Wrong PIN/);
  check("a wrong manager PIN refuses the void", (await val("SELECT status FROM pos_orders WHERE id = ?", orderId)) === "paid");
  for (const d of manager.pin) await pad(d);
  await clickText(p, "button", "Void ₦");
  await waitForText(p, /Sale voided, approved by/);
  const v = await one("SELECT status, void_approved_by, void_reason_code, void_cash_returned FROM pos_orders WHERE id = ?", orderId);
  check("the right PIN voids it, approved by the manager", v?.status === "void" && v?.void_approved_by === manager.id && v?.void_reason_code === "rung_up_wrongly" && v?.void_cash_returned === 1, JSON.stringify(v));
  const open = await one("SELECT staff_id FROM staff_sessions WHERE station_id = ? AND ended_at IS NULL", acc.station.id);
  check("approving doesn't switch who is signed in", open?.staff_id === acc.id, JSON.stringify(open));
  await ctx.close();
}

{
  const { ctx, p } = await as("restaurant_bar_manager");
  await go(p, "/app/sales/reports?range=today");
  check("the manager sees it under Transfers and POS payments to check, with the reference", new RegExp(`Transfers and POS payments to check[\\s\\S]*${ref}`).test(await text(p)));
  await ctx.close();
}

// I8: till improvements, on the bar terminal (1280×720) as a restaurant & bar attendant.
{
  const { ctx: c8, p: t } = await as("restaurant_bar", { viewport: TERMINAL });
  await t.evaluate(() => localStorage.setItem("victoria-station", JSON.stringify({ counter: "bar", printLayout: "none", autoPrint: false })));
  await go(t, "/app/sales");
  await t.waitForSelector("[data-pay]");
  check("full-screen till: no sidebar for restaurant & bar staff", await t.$$eval("[data-app-nav]", (n) => n.every((x) => !x.offsetParent)));
  check("the till bar keeps Orders and Close my day", /Orders[\s\S]*Close my day/.test(await t.$eval("header", (h) => h.innerText)));
  const pay = await t.$eval("[data-pay]", (b) => {
    const cs = getComputedStyle(b.parentElement);
    return { h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, parent: b.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  check("Take payment is full width and at least 56px tall", pay.h >= 56 && pay.w >= pay.parent - 1, JSON.stringify(pay));

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

  // A note on a line, saved with Keep order open, then Same again.
  await t.evaluate((n) => [...document.querySelectorAll("section[aria-label=Menu] li button")].find((b) => b.innerText.startsWith(n))?.click(), item);
  await t.waitForSelector(`[data-line="${item}"] button[aria-expanded]`);
  await t.click(`[data-line="${item}"] button[aria-expanded]`);
  await clickText(t, "[data-note-editor] button", "No ice");
  await clickText(t, "[data-note-editor] button", "Done");
  check("the line shows its note", /No ice/.test(await t.$eval(`[data-line="${item}"]`, (l) => l.innerText)));
  const before = await val("SELECT count(*) FROM pos_orders WHERE status = 'open'");
  await clickText(t, "button[type=submit]", "Keep order open");
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
  await clickText(t, "button[type=submit]", "Confirm");
  await waitForText(t, /RB-\d{4}-\d{6}/);
  check("the receipt prints the note under the item", await t.$$eval(".pos-receipt", (r) => r.some((x) => /No ice/.test(x.textContent))));
  check("the paid order has 2 on the noted line", (await val("SELECT quantity FROM pos_order_items WHERE order_id = ? AND note = 'No ice'", orderId)) === 2);

  // Dark till: a station setting, off by default.
  check("the till isn't dark unless the station says so", !(await t.evaluate(() => "tillDark" in document.documentElement.dataset)));
  await t.evaluate(() => localStorage.setItem("victoria-station", JSON.stringify({ counter: "bar", printLayout: "none", autoPrint: false, tillDark: true })));
  await go(t, "/app/sales");
  await t.waitForSelector("[data-pay]");
  check("dark till when the station says so", await t.evaluate(() => "tillDark" in document.documentElement.dataset));
  await go(t, "/app/sales/orders");
  await settle(t);
  check("and only on the till", !(await t.evaluate(() => "tillDark" in document.documentElement.dataset || "tillFull" in document.documentElement.dataset)));
  await t.evaluate(() => localStorage.removeItem("victoria-station"));
  await c8.close();
}

await finish();
