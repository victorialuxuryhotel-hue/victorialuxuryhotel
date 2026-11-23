import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const SECRET = process.env.MOCK_PAYSTACK_SECRET ?? "sk_test_mock_victoria_local_only";
const WEBHOOK_URL = process.env.APP_WEBHOOK_URL ?? "http://localhost:3000/api/webhooks/paystack";
const SELF = `http://127.0.0.1:${PORT}`;

const transactions = new Map(); // reference -> tx
const emails = [];
const alerts = []; // operational alerts posted to the Slack/Discord-style webhook
const idempotency = new Map();
let nextWebhook = "send"; // send | skip (simulates a delayed / lost webhook)

const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const authed = (req, key) => req.headers.authorization === `Bearer ${key}`;

function sign(body, secret = SECRET) {
  return createHmac("sha512", secret).update(body).digest("hex");
}

async function sendWebhook(tx, { badSignature = false } = {}) {
  const body = JSON.stringify({
    event: tx.status === "success" ? "charge.success" : "charge.failed",
    data: {
      id: tx.id, reference: tx.reference, status: tx.status, amount: tx.reportedAmount ?? tx.amount, currency: tx.currency,
      paid_at: tx.paidAt, channel: tx.channel, gateway_response: tx.gatewayResponse,
      customer: { email: tx.email }, authorization: { last4: "4081", bin: "408408", card_type: "visa" },
    },
  });
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": badSignature ? sign(body, "wrong") : sign(body) },
    body,
  }).catch((e) => ({ status: 0, text: async () => String(e) }));
  return { status: res.status, body: await res.text() };
}

function settle(tx, outcome) {
  tx.status = outcome;
  tx.paidAt = outcome === "success" ? new Date().toISOString() : null;
  tx.channel = "card";
  tx.gatewayResponse = { success: "Approved", failed: "Declined", abandoned: "The transaction was not completed" }[outcome];
}

const checkoutPage = (tx) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Mock Paystack checkout</title>
<style>body{font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px}button{display:block;width:100%;padding:12px;margin:8px 0;font-size:16px;cursor:pointer}</style></head>
<body><h2>Mock Paystack checkout</h2><p>TEST MODE · ${tx.email}</p><p><strong>NGN ${(tx.amount / 100).toLocaleString()}</strong> · ref ${tx.reference}</p>
<form method="post" action="/checkout/${tx.reference}/success"><button id="pay-success">Pay (success)</button></form>
<form method="post" action="/checkout/${tx.reference}/failed"><button id="pay-failed">Decline card (failed)</button></form>
<form method="post" action="/checkout/${tx.reference}/abandoned"><button id="pay-cancel">Cancel payment (abandoned)</button></form></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const path = url.pathname;
  try {
    if (req.method === "POST" && path === "/transaction/initialize") {
      if (!authed(req, SECRET)) return json(res, 401, { status: false, message: "Invalid key" });
      const b = JSON.parse(await readBody(req));
      if (transactions.has(b.reference)) return json(res, 400, { status: false, message: "Duplicate Transaction Reference" });
      if (!Number.isInteger(b.amount) || b.amount <= 0 || b.currency !== "NGN") return json(res, 400, { status: false, message: "Invalid amount/currency" });
      const tx = { id: Date.now(), reference: b.reference, amount: b.amount, currency: b.currency, email: b.email, callbackUrl: b.callback_url, status: "ongoing", paidAt: null, channel: null, gatewayResponse: null };
      transactions.set(b.reference, tx);
      return json(res, 200, { status: true, message: "Authorization URL created", data: { authorization_url: `${SELF}/checkout/${b.reference}`, access_code: randomUUID(), reference: b.reference } });
    }
    if (req.method === "GET" && path.startsWith("/transaction/verify/")) {
      if (!authed(req, SECRET)) return json(res, 401, { status: false, message: "Invalid key" });
      const tx = transactions.get(decodeURIComponent(path.split("/").pop()));
      if (!tx) return json(res, 400, { status: false, message: "Transaction reference not found" });
      return json(res, 200, { status: true, message: "Verification successful", data: {
        reference: tx.reference, status: tx.status, amount: tx.reportedAmount ?? tx.amount, currency: tx.reportedCurrency ?? tx.currency,
        paid_at: tx.paidAt, channel: tx.channel, gateway_response: tx.gatewayResponse } });
    }
    if (req.method === "GET" && path.startsWith("/checkout/")) {
      const tx = transactions.get(path.split("/")[2]);
      if (!tx) { res.writeHead(404); return res.end("unknown"); }
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(checkoutPage(tx));
    }
    if (req.method === "POST" && /^\/checkout\/[^/]+\/(success|failed|abandoned)$/.test(path)) {
      const [, , ref, outcome] = path.split("/");
      const tx = transactions.get(ref);
      settle(tx, outcome);
      if (outcome !== "abandoned" && nextWebhook === "send") await sendWebhook(tx);
      nextWebhook = "send";
      res.writeHead(302, { Location: `${tx.callbackUrl}?trxref=${ref}&reference=${ref}` });
      return res.end();
    }
    if (req.method === "POST" && path === "/emails") {
      if (!req.headers.authorization?.startsWith("Bearer re_")) return json(res, 401, { message: "Invalid API key" });
      const key = req.headers["idempotency-key"];
      if (key && idempotency.has(key)) return json(res, 200, { id: idempotency.get(key) });
      const b = JSON.parse(await readBody(req));
      const id = randomUUID();
      emails.push({ id, to: b.to, from: b.from, subject: b.subject, html: b.html, text: b.text, idempotencyKey: key ?? null });
      if (key) idempotency.set(key, id);
      return json(res, 200, { id });
    }
    if (path === "/__emails") {
      if (req.method === "DELETE") { emails.length = 0; idempotency.clear(); return json(res, 200, { ok: true }); }
      return json(res, 200, emails);
    }
    if (req.method === "POST" && path === "/__control/next-webhook") { nextWebhook = url.searchParams.get("mode") ?? "send"; return json(res, 200, { nextWebhook }); }
    if (req.method === "POST" && path.startsWith("/__control/tx/")) {
      const tx = transactions.get(path.split("/").pop());
      if (!tx) return json(res, 404, { error: "unknown" });
      const b = JSON.parse((await readBody(req)) || "{}");
      if (b.status) settle(tx, b.status);
      if (b.reportedAmount !== undefined) tx.reportedAmount = b.reportedAmount;
      if (b.reportedCurrency) tx.reportedCurrency = b.reportedCurrency;
      const deliveries = [];
      for (let i = 0; i < (b.webhooks ?? 0); i++) deliveries.push(await sendWebhook(tx, { badSignature: b.badSignature }));
      return json(res, 200, { tx, deliveries });
    }
    if (path === "/__alerts") {
      if (req.method === "POST") { alerts.push(JSON.parse((await readBody(req)) || "{}")); return json(res, 200, { ok: true }); }
      if (req.method === "DELETE") { alerts.length = 0; return json(res, 200, { ok: true }); }
      return json(res, 200, alerts);
    }
    if (path === "/__health") return json(res, 200, { ok: true });
    json(res, 404, { status: false, message: "Not found" });
  } catch (err) {
    json(res, 500, { status: false, message: String(err) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`integrations mock on ${SELF} (webhooks → ${WEBHOOK_URL})`));
