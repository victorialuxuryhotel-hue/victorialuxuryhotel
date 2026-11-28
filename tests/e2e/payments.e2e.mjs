import { as, BASE, check, choose, clickText, fill, finish, go, recordDeskPayment, run, session, setValue, text, until, val, waitForText } from "./lib.mjs";

const MOCK = "http://127.0.0.1:4010";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const hotelDay = (n) => val(`SELECT date('now', '+1 hour', '+${n} days')`);
const resStatus = (ref) => val("SELECT status FROM reservations WHERE reference = ?", ref);
let dayOffset = 400 + Math.floor(Math.random() * 300);

await fetch(`${MOCK}/__emails`, { method: "DELETE" });

async function bookAndReview() {
  const { ctx, p } = await session();
  const [ci, co] = [await hotelDay(dayOffset), await hotelDay(dayOffset + 2)];
  dayOffset += 3;
  const email = `payer-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await go(p, `/book/details?category=standard&checkIn=${ci}&checkOut=${co}&guests=1`);
  await fill(p, "#name", "Paying Guest");
  await fill(p, "#email", email);
  await fill(p, "#phone", "+234 803 000 4321");
  await p.click("input[name=acceptTerms]");
  await clickText(p, "button[type=submit]", "Continue");
  await p.waitForFunction(() => location.pathname.startsWith("/book/review/"), { timeout: 30000 });
  await waitForText(p, /VL-[A-Z2-9]{6}/);
  const ref = (await text(p)).match(/VL-[A-Z2-9]{6}/)[0];
  return { ctx, p, email, ref };
}
async function startCheckout(p) {
  await clickText(p, "button", "Pay ₦");
  await p.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 30000 });
  return new URL(p.url()).pathname.split("/").pop();
}
async function payAt(p, button) {
  const paystackRef = await startCheckout(p);
  await p.click(`#${button}`);
  await p.waitForFunction(() => location.pathname.startsWith("/book/confirmation/"), { timeout: 30000 });
  return paystackRef;
}

{
  const { ctx, p, email, ref } = await bookAndReview();
  const expected = await val("SELECT total_amount_kobo FROM reservations WHERE reference = ?", ref);
  check("guest is shown the database-calculated amount", (await text(p)).includes(`₦${(expected / 100).toLocaleString("en-NG")}`));
  const payRef = await payAt(p, "pay-success");
  await waitForText(p, /Paid · confirmed/);
  check("successful payment shows the confirmation page", true);
  check("reservation confirmed", (await resStatus(ref)) === "confirmed");
  const receipt = await val("SELECT receipt_number FROM payments WHERE provider_reference = ?", payRef);
  check("verified payment issues a receipt shown to the guest", /^RCT-/.test(receipt) && ((await text(p)).includes(receipt) || Boolean(await p.$(`a[href*="${receipt}"]`))), receipt);
  await waitForEmails(email, /Booking confirmed/);
  const mails = await emailsTo(email);
  check("exactly one confirmation email to the guest", mails.length === 1 && /Booking confirmed/.test(mails[0].subject), JSON.stringify(mails.map((m) => m.subject)));
  check("email has reference and receipt", mails[0]?.html.includes(ref) && mails[0]?.html.includes(receipt));
  check("hotel inbox gets a copy", (await waitForEmails("frontdesk-inbox@victoria.test", new RegExp(ref))).length === 1);
  check(
    "exactly one verification in the activity log",
    (await val("SELECT count(*) FROM activity_log a JOIN reservations r ON r.id = a.entity_id WHERE r.reference = ? AND a.action = 'payment.verified'", ref)) === 1,
  );

  const dup = await control(payRef, { webhooks: 3 });
  check("duplicate webhooks are acknowledged as duplicates", dup.deliveries.every((d) => d.status === 200 && /duplicate/.test(d.body)), JSON.stringify(dup.deliveries));
  check("still one stored event for this delivery", (await val("SELECT count(*) FROM payment_events WHERE provider_reference = ? AND event_type = 'charge.success'", payRef)) === 1);
  check("stored event has no card details", !((await val("SELECT payload FROM payment_events WHERE provider_reference = ? LIMIT 1", payRef)) ?? "").includes("last4"));
  await sleep(300);
  check("no extra emails after duplicates", (await emailsTo(email)).length === 1);
  const forged = await control(payRef, { webhooks: 1, badSignature: true });
  check("webhook with a bad signature is rejected (401)", forged.deliveries[0].status === 401);
  await ctx.close();
}

{
  const { ctx, p, ref } = await bookAndReview();
  const failedRef = await payAt(p, "pay-failed");
  await waitForText(p, /card wasn.t charged/);
  check("declined card shows a retry page", true);
  check(
    "failed attempt recorded, booking still held",
    (await val("SELECT status FROM payments WHERE provider_reference = ?", failedRef)) === "failed" && (await resStatus(ref)) === "pending_payment",
  );
  await clickText(p, "a", "Try paying again");
  const okRef = await payAt(p, "pay-success");
  await waitForText(p, /Paid · confirmed/);
  check("retry uses a new reference and confirms", okRef !== failedRef && (await resStatus(ref)) === "confirmed");
  await ctx.close();
}

{
  const { ctx, p, ref } = await bookAndReview();
  const abRef = await payAt(p, "pay-cancel");
  await waitForText(p, /card wasn.t charged/);
  check(
    "abandoned checkout is recorded and the guest can retry",
    (await val("SELECT status FROM payments WHERE provider_reference = ?", abRef)) === "abandoned" && (await resStatus(ref)) === "pending_payment",
  );
  await ctx.close();
}

{
  await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
  const { ctx, p, ref, email } = await bookAndReview();
  await payAt(p, "pay-success");
  await waitForText(p, /Paid · confirmed/);
  check("no webhook: return page verifies server-side and confirms", (await resStatus(ref)) === "confirmed");
  await waitForEmails(email, /Booking confirmed/);
  await sleep(500);
  check("and the guest still gets exactly one email", (await emailsTo(email)).length === 1);
  await ctx.close();
}

{
  const { ctx, p, ref } = await bookAndReview();
  const payRef = await startCheckout(p);
  await ctx.close();
  await control(payRef, { status: "success" });
  await run("UPDATE payments SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-35 minutes') WHERE provider_reference = ?", payRef);
  const noAuth = await fetch(`${BASE}/api/cron/expire-reservations`);
  check("scheduled job refuses requests without the secret", noAuth.status === 401);
  const cron = await (await fetch(`${BASE}/api/cron/expire-reservations`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })).json().catch(() => null);
  check("scheduled job settles a paid booking whose guest closed the tab", (await resStatus(ref)) === "confirmed", JSON.stringify(cron));
}

{
  await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
  const { ctx, p, ref } = await bookAndReview();
  const payRef = await startCheckout(p);
  await control(payRef, { reportedAmount: 100 });
  await p.click("#pay-success");
  await p.waitForFunction(() => location.pathname.startsWith("/book/confirmation/"), { timeout: 30000 });
  await waitForText(p, /checking your payment/);
  check("wrong amount is not confirmed; guest told staff will check", (await resStatus(ref)) === "pending_payment");
  check("reservation flagged for staff", /does not match/.test((await val("SELECT attention_reason FROM reservations WHERE reference = ?", ref)) ?? ""));
  await ctx.close();
}


/** A booking made at the desk ("Create only"), awaiting payment. Returns its id. */
async function deskBooking(p, name, email) {
  const [ci, co] = [await hotelDay(dayOffset), await hotelDay(dayOffset + 2)];
  dayOffset += 3;
  await go(p, "/app/reservations/new");
  await setValue(p, "#nci", ci);
  await setValue(p, "#nco", co);
  await fill(p, "#gp", `+23480${String(Date.now()).slice(-8)}`);
  await p.waitForSelector("#gn", { visible: true });
  await fill(p, "#gn", name);
  if (email) await fill(p, "#ge", email);
  await p.click("input[name=categoryId]");
  await clickText(p, "button", "Create only");
  await p.waitForFunction(() => /^\/app\/reservations\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  return new URL(p.url()).pathname.split("/").pop();
}

{
  // Desk payments: transfer needs the tick (browser and server), POS needs 4 slip digits, then a receipt; cancelling a paid booking.
  const { ctx, p } = await as("front_desk");
  const guestEmail = `walkin-${Date.now()}@example.com`;
  const resId = await deskBooking(p, "Cash Guest", guestEmail);
  const count = () => val("SELECT count(*) FROM payments WHERE reservation_id = ?", resId);
  const submitOff = () => p.$$eval("button[type=submit]", (bs) => bs.find((b) => /^Record ₦/.test(b.innerText.trim()))?.disabled);

  await go(p, `/app/payments/record?reservation=${resId}`);
  await p.waitForSelector("#amount");
  check("the amount can be changed: part payments are allowed", !(await p.$eval("#amount", (e) => e.readOnly)));
  const owed = await val("SELECT total_amount_kobo FROM reservations WHERE id = ?", resId);
  await fill(p, "#amount", owed / 100 + 1000);
  check("overpaying is blocked", (await submitOff()) === true && /Only ₦[\d,]+ is owed/.test(await text(p)));
  await fill(p, "#amount", owed / 100);

  await choose(p, "POS / card");
  await p.waitForSelector("#slip", { visible: true });
  check("POS asks for the slip's last 4 digits and the terminal", Boolean(await p.$("#terminal")) && (await p.$eval("#slip", (e) => e.maxLength)) === 4);

  await choose(p, "Transfer");
  await p.waitForSelector("#ref", { visible: true });
  check("transfer: Record is off until the bank-app tick", (await submitOff()) === true);
  check("the bank details are shown (placeholders until set)", /Pay into: /.test(await text(p)));
  // Get past the browser to check the server refuses it too.
  const transferRef = `TRF-${Date.now()}`;
  await fill(p, "#ref", transferRef);
  await p.$$eval("button[type=submit]", (bs) => bs.forEach((b) => b.removeAttribute("disabled")));
  await clickText(p, "button[type=submit]", "Record ₦");
  await waitForText(p, /Tick to confirm the money has arrived|Check the highlighted/);
  check("the server refuses a transfer without the tick", (await count()) === 0);

  const receipt = await recordDeskPayment(p, resId, { method: "bank_transfer", reference: transferRef });
  const confirmed = await until(async () => (await val("SELECT status FROM reservations WHERE id = ?", resId)) === "confirmed", "booking confirmed").catch(() => false);
  check("full payment by transfer: booking confirmed with a receipt", confirmed && /^RCT-/.test(receipt ?? ""), p.url());
  check("the transfer is saved with its reference and the tick", (await val("SELECT count(*) FROM payments WHERE reservation_id = ? AND provider_reference = ? AND seen_in_bank_app = 1 AND method = 'bank_transfer'", resId, transferRef)) === 1);
  check("guest emailed the booking confirmation", (await waitForEmails(guestEmail, /Booking confirmed/)).length === 1);

  await go(p, `/app/payments/receipt/${receipt}`);
  await waitForText(p, new RegExp(receipt));
  const rt = await text(p);
  check("printable receipt shows number, guest and who took it", rt.includes("Cash Guest") && /recorded by|taken by|checked by|received by/i.test(rt), rt.slice(0, 400));

  await go(p, `/app/reservations/${resId}`);
  await clickText(p, "summary", "Cancel booking");
  await fill(p, "#cancel-reason", "Guest called to cancel");
  await clickText(p, "form button[type=submit]", "Cancel booking");
  await waitForText(p, /Cancelled/);
  check("cancelling a paid booking works", (await val("SELECT status FROM reservations WHERE id = ?", resId)) === "cancelled");
  check("guest emailed about the cancellation", (await waitForEmails(guestEmail, /cancelled/i)).length === 1);
  check("refund is flagged for the general manager, not paid automatically", Boolean(await val("SELECT attention_reason FROM reservations WHERE id = ?", resId)) && (await val("SELECT count(*) FROM payments WHERE reservation_id = ? AND amount_kobo < 0", resId)) === 0);

  // Send a payment link: the guest pays the rest online on /pay/<code>.
  const linkRes = await deskBooking(p, "Link Guest", `link-${Date.now()}@example.com`);
  const total = await val("SELECT total_amount_kobo FROM reservations WHERE id = ?", linkRes);
  await recordDeskPayment(p, linkRes, { amount: Math.floor(total / 200) });
  await go(p, `/app/reservations/${linkRes}`);
  await clickText(p, "button", "Send a payment link");
  await p.waitForSelector("[role=dialog] #pl-message", { visible: true });
  const message = await p.$eval("#pl-message", (t) => t.value);
  const url = message.match(/https?:\/\/\S+\/pay\/([A-Za-z0-9_-]+)/);
  check("Send a payment link makes a /pay/ link with a ready message", Boolean(url), message);
  check("with Send on WhatsApp (a wa.me link) and Copy link", /wa\.me/.test(await p.$eval("[role=dialog] a", (a) => a.href)) && /Copy link/.test(await p.$eval("[role=dialog]", (d) => d.innerText)));
  const owedNow = await val("SELECT amount_kobo FROM pay_links WHERE code = ?", url?.[1]);
  check("the link is for what's still owed", owedNow === total - Math.floor(total / 200) * 100, String(owedNow));
  await ctx.close();

  if (url) {
    await fetch(`${MOCK}/__control/next-webhook?mode=skip`, { method: "POST" });
    const { ctx: g, p: gp } = await session({ width: 390, height: 844 });
    await go(gp, `/pay/${url[1]}`);
    await waitForText(gp, /Pay for your stay/);
    await clickText(gp, "button[type=submit]", "Pay ₦");
    await gp.waitForFunction(() => location.href.includes("/checkout/"), { timeout: 30000 });
    await gp.click("#pay-success");
    await gp.waitForFunction(() => location.pathname.startsWith("/book/confirmation/"), { timeout: 30000 });
    const paid = await until(async () => (await val("SELECT coalesce(sum(amount_kobo), 0) FROM payments WHERE reservation_id = ? AND status = 'successful' AND kind = 'payment'", linkRes)) === total, "paid in full", 20000).catch(() => false);
    check("the guest pays the rest through the link", paid);
    await go(gp, `/pay/${url[1]}`);
    check("a paid link no longer takes payment", !(await gp.$("button[type=submit]::-p-text(Pay ₦)")), gp.url());
    await g.close();
  }
}

await finish();
