// Approvals (X10): the desk asks for a refund at check-out, the GM approves it. Company bills (P3): one bill for
// two bookings, paid at the desk, each booking gets its own receipt.
import { as, check, clickText, fill, finish, go, one, run, setValue, text, until, val, waitForText } from "./lib.mjs";

const today = await val("SELECT date('now', '+1 hour')");
const plus = (n) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
const stamp = Date.now().toString(36).toUpperCase().slice(-6);

{
  // A paid guest checked in for two nights (set up directly; the flows under test are the refund and its approval).
  const room = await one(
    `SELECT rm.id, rm.category_id, c.nightly_rate_kobo AS rate FROM rooms rm JOIN room_categories c ON c.id = rm.category_id
     WHERE rm.is_active = 1 AND rm.service_status = 'in_service'
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
                       AND r.check_in < ?2 AND ?1 < max(r.check_out, CASE WHEN r.status = 'checked_in' THEN date('now', '+1 hour', '+1 day') ELSE r.check_out END))
     ORDER BY rm.room_number LIMIT 1`,
    today, plus(3),
  );
  const guest = crypto.randomUUID();
  const res = crypto.randomUUID();
  const desk = await as("front_desk");
  const now = new Date().toISOString();
  await run("INSERT INTO guests (id, full_name, phone) VALUES (?, ?, '+2348000009998')", guest, `E2E Refund ${stamp}`);
  await run(
    `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending_payment', 'walk_in', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 hour'))`,
    res, `VL-R${stamp.slice(-5)}`, crypto.randomUUID(), guest, room.category_id, today, plus(2), room.rate, room.rate * 2,
  );
  await run(
    `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by) VALUES (?, ?, ?, 'offline', 'cash', 'successful', ?, ?, ?)`,
    crypto.randomUUID(), res, room.rate * 2, now, now, desk.acc.id,
  );
  await run("UPDATE reservations SET status = 'confirmed' WHERE id = ?", res);
  await run("UPDATE reservations SET room_id = ? WHERE id = ?", room.id, res);
  await run("UPDATE rooms SET readiness = 'ready' WHERE id = ?", room.id);
  await run("UPDATE reservations SET status = 'checked_in' WHERE id = ?", res);

  // The guest leaves a night early: shorten the stay, then check out with a refund request.
  const { ctx, p } = desk;
  await go(p, `/app/reservations/${res}`);
  await clickText(p, "a", "Extend or shorten");
  await clickText(p, "summary", "Extend or shorten the stay");
  await setValue(p, "#cd-out", plus(1));
  await clickText(p, "button", "Update dates");
  await until(async () => (await val("SELECT check_out FROM reservations WHERE id = ?", res)) === plus(1), "stay shortened", 20000).catch(() => {});
  check("the desk shortens an in-house stay", (await val("SELECT check_out FROM reservations WHERE id = ?", res)) === plus(1));
  await go(p, `/app/reservations/${res}`);
  await clickText(p, "button", "Check out");
  await p.waitForFunction(() => /Key returned/.test(document.querySelector("[role=dialog]")?.innerText ?? ""));
  const drawer = await p.$eval("[role=dialog]", (d) => d.innerText);
  check("check-out shows the guest in credit", /In credit/.test(drawer), drawer.slice(0, 300));
  await clickText(p, "[role=dialog] button", "Ask for a refund");
  await fill(p, "#refund-reason", "Left a night early (browser test)");
  await clickText(p, "[role=dialog] button", "Send refund request");
  await waitForText(p, /Refund request sent to the GM/);
  const asked = await one("SELECT id, amount_kobo, decided_at FROM refund_requests WHERE reservation_id = ?", res);
  check("the refund request is waiting, for one night", asked && asked.amount_kobo === room.rate && asked.decided_at === null, JSON.stringify(asked));
  check("nothing is paid out at the desk", (await val("SELECT count(*) FROM payments WHERE reservation_id = ? AND kind = 'refund'", res)) === 0);
  await clickText(p, "[role=dialog] label", "Key returned");
  // The footer button turns on once the screen has the tick; pressing it earlier does nothing.
  await p.waitForFunction(() => [...document.querySelectorAll("[role=dialog] button")].some((b) => b.textContent.trim().startsWith("Check out") && !b.disabled), { timeout: 10000 });
  await clickText(p, "[role=dialog] button", "Check out");
  await waitForText(p, /Checked out/).catch(() => {});
  check("and the guest is checked out", (await val("SELECT status FROM reservations WHERE id = ?", res)) === "checked_out", await p.$eval("[role=dialog]", (d) => d.innerText.replace(/\s+/g, " ")).catch(() => ""));
  await ctx.close();

  // The front desk can't open Approvals; the GM approves it.
  const fd = await as("front_desk");
  await go(fd.p, "/app/approvals");
  check("front desk cannot open Approvals", /don.t have access/.test(await text(fd.p)));
  await fd.ctx.close();

  const gm = await as("general_manager");
  await go(gm.p, "/app/approvals");
  await waitForText(gm.p, /Waiting for you/);
  const row = await until(() => gm.p.evaluate((name) => {
    const tr = [...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(name));
    tr?.querySelector("button")?.click();
    return Boolean(tr);
  }, `E2E Refund ${stamp}`), "refund in the list");
  check("the GM sees the refund under Approvals", row);
  await gm.p.waitForSelector("[role=dialog] #note", { visible: true });
  const facts = await gm.p.$eval("[role=dialog]", (d) => d.innerText);
  check("Review shows what was paid and used", /Paid[\s\S]*Used/.test(facts), facts.slice(0, 300));
  await fill(gm.p, "#note", "Approved: left a night early");
  await clickText(gm.p, "[role=dialog] button", "Approve refund");
  const approved = await until(async () => (await one("SELECT decision, payment_id, decided_by FROM refund_requests WHERE id = ?", asked.id))?.decision === "approved", "approved", 20000).catch(() => false);
  check("approving writes the refund", approved && (await val("SELECT count(*) FROM payments WHERE reservation_id = ? AND kind = 'refund'", res)) === 1);
  check("decided by the GM, not the person who asked", (await val("SELECT decided_by FROM refund_requests WHERE id = ?", asked.id)) === gm.acc.id);
  await gm.ctx.close();
}

{
  // Company bill: two unpaid bookings, one bill, paid by transfer; each booking gets its own receipt.
  const { ctx, p } = await as("front_desk");
  const ids = [];
  const offset = 300 + Math.floor(Math.random() * 90);
  for (const [i, name] of ["Bill Guest One", "Bill Guest Two"].entries()) {
    await go(p, "/app/reservations/new");
    await setValue(p, "#nci", plus(offset + i));
    await setValue(p, "#nco", plus(offset + i + 1));
    await fill(p, "#gp", `+23480${String(Date.now() + i).slice(-8)}`);
    await p.waitForSelector("#gn", { visible: true });
    await fill(p, "#gn", `${name} ${stamp}`);
    await p.click("input[name=categoryId]");
    await clickText(p, "button", "Create only");
    await p.waitForFunction(() => /^\/app\/reservations\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
    ids.push(new URL(p.url()).pathname.split("/").pop());
  }
  const refs = await Promise.all(ids.map((id) => val("SELECT reference FROM reservations WHERE id = ?", id)));
  const total = await val(`SELECT sum(total_amount_kobo) FROM reservations WHERE id IN (?, ?)`, ...ids);

  await go(p, "/app/bills");
  await fill(p, "#companyName", `Ondo Co-op ${stamp}`);
  await setValue(p, "#validUntil", plus(offset - 1));
  for (const id of ids) await p.click(`input[name=reservationIds][value="${id}"]`);
  await clickText(p, "button[type=submit]", "Make bill");
  await p.waitForFunction(() => /^\/app\/bills\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await waitForText(p, /This is a bill, not a receipt/);
  const page = await text(p);
  check("the bill is numbered and lists both bookings", /B-\d{4}/.test(page) && refs.every((r) => page.includes(r)), page.slice(0, 300));
  check("it says it is not a receipt", /This is a bill, not a receipt/.test(page));
  check("the bookings are held until the bill's valid-until date", (await val("SELECT count(*) FROM reservations WHERE id IN (?, ?) AND hold_expires_at >= ?", ...ids, plus(offset - 1))) === 2);

  await clickText(p, "[role=radiogroup] label", "Transfer");
  await fill(p, "#bill-amount", total / 100);
  await fill(p, "#bill-ref", `BILL-${stamp}`);
  await clickText(p, "label", "arrive in the hotel");
  await clickText(p, "button", "Record ₦");
  await waitForText(p, /Paid in full/);
  const paid = await all2(ids);
  check("paying the bill splits it across the bookings, each with its own receipt", paid.length === 2 && paid.every((x) => /^RCT-/.test(x.receipt_number ?? "")) && paid[0].receipt_number !== paid[1].receipt_number, JSON.stringify(paid));
  check("and confirms both bookings", (await val("SELECT count(*) FROM reservations WHERE id IN (?, ?) AND status = 'confirmed'", ...ids)) === 2);
  await ctx.close();
}

async function all2(ids) {
  const out = [];
  for (const id of ids) out.push(await one("SELECT receipt_number, amount_kobo FROM payments WHERE reservation_id = ? AND status = 'successful' ORDER BY created_at DESC LIMIT 1", id));
  return out.filter(Boolean);
}

await finish();
