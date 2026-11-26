// Fix 3: for a paid guest in house, extra nights wait for their payment; taking the payment applies them.
import { as, check, clickText, finish, go, one, run, settle, text, val, waitForText } from "./lib.mjs";

const today = await val("SELECT date('now', '+1 hour')");
const plus = (n) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
const stamp = Date.now().toString(36).toUpperCase().slice(-6);

// A paid guest checked in to a free room, staying two nights (set up directly; the flow under test is the change).
const room = await one(
  `SELECT rm.id, rm.category_id, c.nightly_rate_kobo AS rate FROM rooms rm JOIN room_categories c ON c.id = rm.category_id
   WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
     AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
                     AND r.check_in < ?2 AND ?1 < max(r.check_out, CASE WHEN r.status = 'checked_in' THEN date('now', '+1 hour', '+1 day') ELSE r.check_out END))
   ORDER BY rm.room_number LIMIT 1`,
  today, plus(4),
);
const guest = crypto.randomUUID();
const res = crypto.randomUUID();
const staff = await val("SELECT id FROM staff_profiles WHERE role = 'front_desk' AND is_active = 1 LIMIT 1");
await run("INSERT INTO guests (id, full_name, phone) VALUES (?, ?, '+2348000009999')", guest, `E2E Extend ${stamp}`);
await run(
  `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending_payment', 'walk_in', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 hour'))`,
  res, `VL-${stamp}`, crypto.randomUUID(), guest, room.category_id, today, plus(2), room.rate, room.rate * 2,
);
const now = new Date().toISOString();
await run(
  `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by) VALUES (?, ?, ?, 'offline', 'cash', 'successful', ?, ?, ?)`,
  crypto.randomUUID(), res, room.rate * 2, now, now, staff,
);
await run("UPDATE reservations SET status = 'confirmed' WHERE id = ?", res);
await run("UPDATE reservations SET room_id = ? WHERE id = ?", room.id, res);
await run("UPDATE rooms SET readiness = 'ready' WHERE id = ?", room.id);
await run("UPDATE reservations SET status = 'checked_in' WHERE id = ?", res);

const { ctx, p } = await as("front_desk");
await go(p, `/app/reservations/${res}`);
await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
await p.$eval("#cd-out", (e, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
  e.dispatchEvent(new Event("input", { bubbles: true }));
}, plus(3));
await clickText(p, "button", "Update dates");
await waitForText(p, /cost .* more\. Take the payment/);
check("an extra night for a paid guest waits for payment", (await val("SELECT check_out FROM reservations WHERE id = ?", res)) === plus(2));

await go(p, `/app/reservations/${res}`);
const page = await text(p);
check("the booking shows the change waiting and Take payment as the next step", /Waiting for payment: Stay extended to/.test(page) && /Take payment · ₦/.test(page));

await go(p, `/app/payments/record?reservation=${res}`);
check("Take payment says what the money is for", /Includes ₦[\d,]+ for: Stay extended to/.test(await text(p)));
await p.click("input[name=confirmReceived]");
await clickText(p, "button", "Take payment");
await clickText(p, "button", "Yes, take payment");
await waitForText(p, /RCT-/);
await settle(p);
check("taking the payment extends the stay", (await val("SELECT check_out FROM reservations WHERE id = ?", res)) === plus(3));
check("and the change is recorded as paid", (await val("SELECT count(*) FROM reservation_changes WHERE reservation_id = ? AND status = 'applied' AND payment_id IS NOT NULL", res)) === 1);
await ctx.close();
await finish();
