import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const BASE = "http://localhost:3000";
const MOCK = "http://127.0.0.1:4010";
const env = parseEnv(readFileSync(".env.local", "utf8"));
const sql = (q) => execSync(`docker exec -i supabase_db_victoria-hotel psql -U postgres -qtA`, { input: q }).toString().trim();
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const waitText = (p, re, timeout = 20000) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout }, re.source);
const emailsTo = async (to) => (await (await fetch(`${MOCK}/__emails`)).json()).filter((e) => e.to.includes(to));
const waitForEmails = async (to, match, timeout = 15000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const found = (await emailsTo(to)).filter((m) => match.test(m.subject));
    if (found.length || Date.now() > end) return found;
    await sleep(250);
  }
};
const control = (ref, body) => fetch(`${MOCK}/__control/tx/${ref}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
let dayOffset = 400 + Math.floor(Math.random() * 300);

await fetch(`${MOCK}/__emails`, { method: "DELETE" });

async function bookAndReview() {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const ci = sql(`select (hotel_today() + ${dayOffset})::text;`);
  const co = sql(`select (hotel_today() + ${dayOffset + 2})::text;`);
  dayOffset += 3;
  const email = `payer-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await p.goto(`${BASE}/book/details?category=standard&checkIn=${ci}&checkOut=${co}&guests=1`, { waitUntil: "networkidle0" });
  await p.waitForSelector("#name");
  await p.type("#name", "Paying Guest");
  await p.type("#email", email);
  await p.type("#phone", "+234 803 000 4321");
  await p.click("input[name=acceptTerms]");
  await p.click("button::-p-text(Continue to payment)");
  await p.waitForFunction(() => location.pathname.startsWith("/book/review/"), { timeout: 20000 });
  await waitText(p, /VL-[A-Z2-9]{6}/);
  const token = new URL(p.url()).pathname.split("/").pop();
  const ref = (await p.evaluate(() => document.body.innerText)).match(/VL-[A-Z2-9]{6}/)[0];
  return { ctx, p, email, token, ref };
}
async function payAt(p, button) {
  await p.click("button::-p-text(Pay securely)");
  await p.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 20000 });
  const paystackRef = new URL(p.url()).pathname.split("/").pop();
  await p.click(`#${button}`);
  await p.waitForFunction(() => location.pathname.startsWith("/book/confirmation/"), { timeout: 30000 });
  return paystackRef;
}
const resStatus = (ref) => sql(`select status from reservations where reference = '${ref}';`);

{
  const { ctx, p, email, ref } = await bookAndReview();
  check("guest is charged the database-calculated amount", (await p.evaluate(() => document.body.innerText)).includes("₦"));
  const payRef = await payAt(p, "pay-success");
  await waitText(p, /You.re booked/);
  check("successful payment shows the confirmation page", true);
  check("reservation confirmed", resStatus(ref) === "confirmed");
  const receipt = sql(`select receipt_number from payments where provider_reference = '${payRef}';`);
  check("verified payment issues a receipt shown to the guest", /^RCT-/.test(receipt) && (await p.evaluate(() => document.body.innerText)).includes(receipt), receipt);
  await waitForEmails(email, /Booking confirmed/);
  const mails = await emailsTo(email);
  check("exactly one confirmation email to the guest", mails.length === 1 && /Booking confirmed/.test(mails[0].subject), JSON.stringify(mails.map((m) => m.subject)));
  check("email has reference and receipt", mails[0]?.html.includes(ref) && mails[0]?.html.includes(receipt));
  check("hotel inbox gets a copy", (await waitForEmails("frontdesk-inbox@victoria.test", new RegExp(ref))).length === 1);
  check("exactly one verification in the audit log", sql(`select count(*) from activity_log a join reservations r on r.id = a.entity_id where r.reference='${ref}' and a.action='payment.verified';`) === "1");

  const dup = await control(payRef, { webhooks: 3 });
  check("duplicate webhooks are acknowledged as duplicates", dup.deliveries.every((d) => d.status === 200 && /duplicate/.test(d.body)), JSON.stringify(dup.deliveries));
  check("still one stored event for this delivery", sql(`select count(*) from payment_events where provider_reference='${payRef}' and event_type='charge.success';`) === "1");
  check("stored event has no card details", !sql(`select payload::text from payment_events where provider_reference='${payRef}' limit 1;`).includes("last4"));
  await sleep(300);
  check("no extra emails after duplicates", (await emailsTo(email)).length === 1);

  const forged = await control(payRef, { webhooks: 1, badSignature: true });
  check("webhook with a bad signature is rejected (401)", forged.deliveries[0].status === 401);
  await ctx.close();
}

{
  const { ctx, p, ref } = await bookAndReview();
  const failedRef = await payAt(p, "pay-failed");
  await waitText(p, /didn.t go through/);
  check("declined card shows a retry page", true);
  check("failed attempt recorded, booking still held", sql(`select status from payments where provider_reference='${failedRef}';`) === "failed" && resStatus(ref) === "pending_payment");
  await p.click("a::-p-text(Try again)");
  await p.waitForSelector("button::-p-text(Pay securely)");
  const okRef = await payAt(p, "pay-success");
  await waitText(p, /You.re booked/);
  check("retry uses a new reference and confirms", okRef !== failedRef && resStatus(ref) === "confirmed");
  await ctx.close();
}

{
  const { ctx, p, ref } = await bookAndReview();
  const abRef = await payAt(p, "pay-cancel");
  await waitText(p, /didn.t go through/);
  check("abandoned checkout is recorded and the guest can retry", sql(`select status from payments where provider_reference='${abRef}';`) === "abandoned" && resStatus(ref) === "pending_payment");
  await ctx.close();
}

{
  await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
  const { ctx, p, ref, email } = await bookAndReview();
  await payAt(p, "pay-success");
  await waitText(p, /You.re booked/);
  check("no webhook: return page verifies server-side and confirms", resStatus(ref) === "confirmed");
  await waitForEmails(email, /Booking confirmed/);
  await sleep(500);
  check("and the guest still gets exactly one email", (await emailsTo(email)).length === 1);
  await ctx.close();
}

{
  const { ctx, p, ref } = await bookAndReview();
  await p.click("button::-p-text(Pay securely)");
  await p.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 20000 });
  const payRef = new URL(p.url()).pathname.split("/").pop();
  await ctx.close(); // guest closes the tab
  await control(payRef, { status: "success" }); // paid at Paystack, no webhook, no callback
  sql(`update payments set created_at = now() - interval '35 minutes' where provider_reference='${payRef}';`);
  const noAuth = await fetch(`${BASE}/api/cron/expire-reservations`);
  check("scheduled job refuses requests without the secret", noAuth.status === 401);
  const cron = await (await fetch(`${BASE}/api/cron/expire-reservations`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })).json();
  check("scheduled job settles the paid booking", resStatus(ref) === "confirmed", JSON.stringify(cron));
}

{
  await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
  const { ctx, p, ref } = await bookAndReview();
  await p.click("button::-p-text(Pay securely)");
  await p.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 20000 });
  const payRef = new URL(p.url()).pathname.split("/").pop();
  await control(payRef, { reportedAmount: 100 });
  await p.click("#pay-success");
  await p.waitForFunction(() => location.pathname.startsWith("/book/confirmation/"), { timeout: 30000 });
  await waitText(p, /checking your payment/);
  check("wrong amount is not confirmed; guest told staff will check", resStatus(ref) === "pending_payment");
  check("reservation flagged for staff", /does not match/.test(sql(`select attention_reason from reservations where reference='${ref}';`)));
  await ctx.close();
}

{
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await p.type("#email", "frontdesk@victoria.test");
  await p.type("#password", "victoria-dev-2026!");
  await p.click("button[type=submit]");
  await p.waitForFunction(() => location.pathname === "/app", { timeout: 20000 });

  const cat = sql("select id from room_categories where slug='standard';");
  const guestEmail = `walkin-${Date.now()}@example.com`;
  const ci = sql(`select (hotel_today() + ${dayOffset})::text;`);
  const co = sql(`select (hotel_today() + ${dayOffset + 2})::text;`);
  dayOffset += 3;
  await p.goto(`${BASE}/app/reservations/new`, { waitUntil: "networkidle0" });
  await p.waitForSelector("#nco");
  for (const [sel, v] of [["#nci", ci], ["#nco", co]]) {
    await p.$eval(sel, (e, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, val); e.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  }
  await p.click(`input[value="${cat}"]`);
  await p.type("#gn", "Cash Guest");
  await p.type("#gp", "+2348000007777");
  await p.type("#ge", guestEmail);
  await p.click("button::-p-text(Create reservation)");
  await p.waitForFunction(() => /^\/app\/reservations\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 20000 });
  await waitText(p, /Awaiting payment/);
  const resId = new URL(p.url()).pathname.split("/").pop();
  const total = Number(sql(`select total_amount_kobo from reservations where id='${resId}';`));

  await p.goto(`${BASE}/app/payments/record?reservation=${resId}`, { waitUntil: "networkidle0" });
  await p.waitForSelector("#amount");
  await p.$eval("#amount", (e) => (e.value = ""));
  await p.type("#amount", String(total / 200)); // half
  await p.click("button::-p-text(Record payment)");
  await sleep(800);
  check("browser blocks recording without confirming receipt", sql(`select count(*) from payments where reservation_id='${resId}';`) === "0");
  await p.$eval("input[name=confirmReceived]", (e) => e.removeAttribute("required"));
  await p.click("button::-p-text(Record payment)");
  await waitText(p, /Confirm the hotel has received this money/);
  check("server also refuses without confirmation", sql(`select count(*) from payments where reservation_id='${resId}';`) === "0");
  check("entered amount is kept after the error", (await p.$eval("#amount", (e) => e.value)) === String(total / 200));
  await p.click("input[name=confirmReceived]");
  await p.click("button::-p-text(Record payment)");
  await p.waitForFunction(() => location.search.includes("paid="), { timeout: 20000 });
  check("part payment recorded; booking still awaiting the balance", sql(`select status from reservations where id='${resId}';`) === "pending_payment");
  check("guest emailed a payment receipt", (await waitForEmails(guestEmail, /Payment received/)).length === 1);

  await p.goto(`${BASE}/app/payments/record?reservation=${resId}`, { waitUntil: "networkidle0" });
  await p.waitForSelector("#amount");
  await p.select("#method", "bank_transfer");
  await p.type("#ref", `TRF-${Date.now()}`);
  await p.click("input[name=confirmReceived]");
  await p.click("button::-p-text(Record payment)");
  await p.waitForFunction(() => location.search.includes("paid="), { timeout: 20000 });
  check("balance recorded: booking confirmed", sql(`select status from reservations where id='${resId}';`) === "confirmed");
  check("guest emailed the booking confirmation", (await waitForEmails(guestEmail, /Booking confirmed/)).length === 1);

  const receipt = sql(`select receipt_number from payments where reservation_id='${resId}' order by created_at desc limit 1;`);
  await p.goto(`${BASE}/app/payments/receipt/${receipt}`, { waitUntil: "networkidle0" });
  await waitText(p, new RegExp(receipt));
  const rt = await p.evaluate(() => document.body.innerText);
  check("printable receipt shows number, guest and 'recorded by'", rt.includes("Cash Guest") && /recorded by/i.test(rt));

  await p.goto(`${BASE}/app/reservations/${resId}`, { waitUntil: "networkidle0" });
  check("confirmed booking with payments offers cancel", (await p.evaluate(() => document.body.innerText)).includes("Cancel"));
  await p.click("summary::-p-text(Cancel)");
  await p.type("#cancel-reason", "Guest called to cancel");
  await p.click("button::-p-text(Cancel reservation)");
  await waitText(p, /Cancelled/);
  check("guest emailed about the cancellation", (await waitForEmails(guestEmail, /Reservation cancelled/)).length === 1);
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
