import { as, check, clickText, fill, finish, go, one, run, session, settle, text, val, waitForText } from "./lib.mjs";

const plus = async (n) => val(`SELECT date('now', '+1 hour', '+${n} days')`);
const waitPath = (p, re) => p.waitForFunction((src) => new RegExp(src).test(location.pathname), { timeout: 30000 }, re.source);

{
  const { ctx, p } = await session({ width: 390, height: 844 });
  const [ci, co] = [await plus(20), await plus(22)];
  await go(p, `/book?checkIn=${ci}&checkOut=${co}&guests=2`);
  const t = await text(p);
  check("guest sees live room options with totals", /₦/.test(t) && (await p.$('a[href^="/book/details?"]')) !== null, t.slice(0, 300));
  check("no room counts are shown to guests", !/rooms? left|\d+ available|only \d/i.test(t));
  await p.click('a[href^="/book/details?"]');
  await p.waitForSelector("#name", { timeout: 30000 });
  check("selecting a room opens the details step", p.url().includes("/book/details"));
  await fill(p, "#name", "Online Guest");
  await fill(p, "#email", `online-${Date.now()}@example.com`);
  await fill(p, "#phone", "not a phone");
  await p.click("input[name=acceptTerms]");
  await clickText(p, "button", "Continue to payment");
  await waitForText(p, /valid phone number/i);
  check("invalid phone is refused by the server", true);
  check("guest's other details are kept after the error", (await p.$eval("#name", (e) => e.value)) === "Online Guest");
  await fill(p, "#phone", "+234 803 000 1234");
  if (!(await p.$eval("input[name=acceptTerms]", (e) => e.checked))) await p.click("input[name=acceptTerms]");
  await clickText(p, "button", "Continue to payment");
  await waitPath(p, /^\/book\/review\//);
  await waitForText(p, /VL-[A-Z2-9]{6}/);
  const ref = (await text(p)).match(/VL-[A-Z2-9]{6}/)?.[0];
  check("guest reaches review with a booking reference", Boolean(ref));
  const row = await one(
    "SELECT r.status, r.source, r.total_amount_kobo = c.nightly_rate_kobo * 2 AS priced FROM reservations r JOIN room_categories c ON c.id = r.category_id WHERE r.reference = ?",
    ref,
  );
  check("database holds it as a pending website booking priced by the server", row?.status === "pending_payment" && row?.source === "website" && row?.priced === 1, JSON.stringify(row));
  await ctx.close();
}

let id;
{
  const { ctx, p } = await as("front_desk");
  p.on("dialog", (d) => d.accept());
  await go(p, "/app/reservations/new");
  const co = await plus(2);
  await p.$eval("#nco", (e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, co);
  await fill(p, "#gp", `+23480${String(Date.now()).slice(-8)}`);
  await p.waitForSelector("#gn", { visible: true });
  await fill(p, "#gn", "Walk In Guest");
  await p.click("input[name=categoryId]");
  await clickText(p, "button", "Create only");
  await waitPath(p, /^\/app\/reservations\/[0-9a-f-]{36}$/);
  id = p.url().split("?")[0].split("/").pop();
  await waitForText(p, /Awaiting payment/i);
  check("front desk creates a walk-in; it awaits payment", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "pending_payment");
  const t = await text(p);
  check("front desk has no manager option to hold the room longer", !t.includes("Manager option"));
  check("there is no way to confirm without payment", !/Confirm anyway|Confirm without/i.test(t));

  await go(p, `/app/payments/record?reservation=${id}`);
  const balance = await val("SELECT total_amount_kobo FROM reservations WHERE id = ?", id);
  check("payment form takes the whole balance", (await p.$eval("#amount", (e) => e.value)) === String(balance / 100));
  await p.click("input[name=confirmReceived]");
  await clickText(p, "button", "Take payment");
  await clickText(p, "button", "Yes, take payment");
  await p.waitForFunction(() => !location.pathname.endsWith("/record") || /recorded/i.test(document.body.innerText), { timeout: 30000 }, id);
  await settle(p);
  check("recording the full balance confirms the booking", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "confirmed");

  await go(p, `/app/reservations/${id}`);
  const firstRoom = await val("SELECT room_id FROM reservations WHERE id = ?", id);
  check("a room is assigned once the booking is paid", Boolean(firstRoom));
  const other = await p.$$eval("#room optgroup:first-of-type option", (os, cur) => os.find((o) => o.value !== cur)?.value, firstRoom);
  await p.select("#room", other);
  await clickText(p, "button", "Change");
  await waitForText(p, /Moved to Room/);
  const roomNo = await val("SELECT rm.room_number FROM reservations r JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?", id);
  check("front desk moves the guest to another room of the same type", (await val("SELECT room_id FROM reservations WHERE id = ?", id)) === other);
  await run("UPDATE rooms SET readiness = 'ready' WHERE room_number = ?", roomNo);

  await go(p, `/app/reservations/${id}`);
  await clickText(p, "button", "Check in");
  await waitForText(p, /Checked in/);
  check("front desk checks the guest in", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "checked_in");
  await go(p, "/app/rooms");
  const board = await text(p);
  check("room board shows the room occupied by the guest", board.includes("Walk In Guest"), board.slice(0, 300));
  await go(p, `/app/reservations/${id}`);
  await clickText(p, "button", "Check out");
  await waitForText(p, /Checked out/);
  check("front desk checks the guest out", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "checked_out");
  check("room needs cleaning after check-out", (await val("SELECT readiness FROM rooms WHERE room_number = ?", roomNo)) === "needs_cleaning");
  const actions = (await val("SELECT group_concat(action, ',') FROM (SELECT action FROM activity_log WHERE entity_id = ? ORDER BY rowid)", id)) ?? "";
  check(
    "every step is in the activity log",
    ["reservation.created", "reservation.checked_in", "reservation.checked_out"].every((a) => actions.includes(a)),
    actions,
  );
  await ctx.close();
}

await finish();
