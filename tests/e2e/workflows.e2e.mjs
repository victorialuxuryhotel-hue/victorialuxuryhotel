import { as, check, checkInWithCard, checkOutWithKey, choose, clickText, fill, finish, go, one, recordDeskPayment, run, session, setValue, text, until, val, waitForText } from "./lib.mjs";

const plus = async (n) => val(`SELECT date('now', '+1 hour', '+${n} days')`);
const ROOM_CHOICE = 'ul[aria-label="Room types"] button[aria-pressed], ul[aria-label^="Fits"] button[aria-pressed]';
const waitPath = (p, re) => p.waitForFunction((src) => new RegExp(src).test(location.pathname), { timeout: 30000 }, re.source);

{
  const { ctx, p } = await session({ width: 390, height: 844 });
  const [ci, co] = [await plus(20), await plus(22)];
  await go(p, `/book?checkIn=${ci}&checkOut=${co}&guests=2`);
  const t = await text(p);
  check("guest sees live room options with totals", /₦/.test(t) && (await p.$(ROOM_CHOICE)) !== null, t.slice(0, 300));
  check("no room counts are shown to guests", !/rooms? left|\d+ available|only \d/i.test(t));
  // Choose a room, then Continue (G4/M2).
  await p.click(ROOM_CHOICE);
  await clickText(p, 'a[href^="/book/details?"]', "Continue");
  await p.waitForSelector("#name", { timeout: 30000 });
  check("choosing a room and Continue opens the details step", p.url().includes("/book/details"));
  await fill(p, "#name", "Online Guest");
  await fill(p, "#email", `online-${Date.now()}@example.com`);
  await fill(p, "#phone", "not a phone");
  await p.click("input[name=acceptTerms]");
  await clickText(p, "button[type=submit]", "Continue");
  await waitForText(p, /valid phone number/i);
  check("invalid phone is refused by the server", true);
  check("guest's other details are kept after the error", (await p.$eval("#name", (e) => e.value)) === "Online Guest");
  await fill(p, "#phone", "+234 803 000 1234");
  if (!(await p.$eval("input[name=acceptTerms]", (e) => e.checked))) await p.click("input[name=acceptTerms]");
  await clickText(p, "button[type=submit]", "Continue");
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
  // New booking at the desk, a part payment, the rest by transfer, a room move, check-in with the registration card, check-out.
  const { ctx, p } = await as("front_desk");
  p.on("dialog", (d) => d.accept());
  await go(p, "/app/reservations/new");
  await setValue(p, "#nco", await plus(2));
  await fill(p, "#gp", `+23480${String(Date.now()).slice(-8)}`);
  await p.waitForSelector("#gn", { visible: true });
  await fill(p, "#gn", "Walk In Guest");
  // A room type with at least two clean rooms free tonight (the shared local data has guests staying on), so the move has somewhere to go.
  const typeId = await val(
    `SELECT rm.category_id FROM rooms rm WHERE rm.is_active = 1 AND rm.service_status = 'in_service' AND rm.readiness = 'ready'
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id AND (r.status = 'checked_in' OR (r.status IN ('pending_payment', 'confirmed') AND r.check_in < ?1 AND r.check_out > date('now', '+1 hour'))))
     GROUP BY rm.category_id HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 1`,
    await plus(2),
  );
  await p.click(`input[name=categoryId][value="${typeId}"]`);
  await clickText(p, "button", "Create only");
  await waitPath(p, /^\/app\/reservations\/[0-9a-f-]{36}$/);
  id = p.url().split("?")[0].split("/").pop();
  await waitForText(p, /Awaiting payment/i);
  check("front desk creates a booking; it awaits payment", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "pending_payment");
  const t = await text(p);
  check("front desk has no manager option to hold the room longer", !t.includes("Manager option"));
  check("there is no way to confirm without payment", !/Confirm anyway|Confirm without/i.test(t));

  const total = await val("SELECT total_amount_kobo FROM reservations WHERE id = ?", id);
  await go(p, `/app/payments/record?reservation=${id}`);
  await p.waitForSelector("#amount");
  check("the payment form starts with the whole balance", (await p.$eval("#amount", (e) => e.value)) === String(total / 100));
  check("cash, transfer and POS are the methods", /Cash[\s\S]*Transfer[\s\S]*POS \/ card/.test(await p.$eval("[role=radiogroup]", (g) => g.innerText)));
  const part = Math.floor(total / 200); // half, in naira
  const first = await recordDeskPayment(p, id, { amount: part });
  check("a part payment in cash gets a receipt", /^RCT-/.test(first ?? ""), p.url());
  check("a part payment confirms the booking so the room isn't released", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "confirmed");
  await waitForText(p, /Balance/);
  check("the booking shows what's still owed", (await p.$eval("#bill", (b) => b.innerText)).includes(`₦${((total - part * 100) / 100).toLocaleString("en-NG")}`));

  // The rest by transfer: the tick and a reference (or the sender's name) are required.
  await go(p, `/app/payments/record?reservation=${id}`);
  await choose(p, "Transfer");
  await p.waitForSelector("#ref", { visible: true });
  const submit = () => p.$$eval("button[type=submit]", (bs) => bs.find((b) => /^Record ₦/.test(b.innerText.trim()))?.disabled);
  check("a transfer can't be recorded without the bank-app tick", (await submit()) === true);
  const ref = `TRF-${Date.now()}`;
  const second = await recordDeskPayment(p, id, { method: "bank_transfer", reference: ref });
  check("the rest by transfer is recorded with its reference", Boolean(second) && (await val("SELECT count(*) FROM payments WHERE reservation_id = ? AND provider_reference = ? AND seen_in_bank_app = 1", id, ref)) === 1, p.url());

  await go(p, `/app/reservations/${id}`);
  const firstRoom = await val("SELECT room_id FROM reservations WHERE id = ?", id);
  check("a room is assigned once the booking is paid", Boolean(firstRoom));
  await clickText(p, "a", "Move room");
  await p.waitForSelector("#room", { visible: true });
  // The picker greys out rooms that can't be chosen ("To clean", "Occupied · …"); pick one that can.
  const other = await p.$$eval("#room optgroup:first-of-type option", (os, cur) => os.find((o) => o.value !== cur && !o.disabled)?.value, firstRoom);
  check("the picker offers another free, clean room of the same type", Boolean(other));
  await p.select("#room", other);
  await p.click("form:has(#room) button[type=submit]");
  await waitForText(p, /Moved to Room/);
  const roomNo = await val("SELECT rm.room_number FROM reservations r JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?", id);
  check("front desk moves the guest to another room of the same type", (await val("SELECT room_id FROM reservations WHERE id = ?", id)) === other);
  await run("UPDATE rooms SET readiness = 'ready' WHERE room_number = ?", roomNo);

  // Check in: the registration card is required; only the last 4 of the ID are kept.
  await go(p, `/app/reservations/${id}`);
  await checkInWithCard(p, { idNumber: "A12345678", rules: false });
  await waitForText(p, /Complete the registration card/);
  check("check-in is refused without the house-rules tick", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "confirmed");
  await clickText(p, "[role=dialog] label", "Guest has seen the house rules");
  await clickText(p, "[role=dialog] button", "Check in and give key");
  await waitForText(p, /Checked in to Room/);
  check("front desk checks the guest in with the registration card", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "checked_in");
  const reg = await one("SELECT * FROM guest_registrations WHERE reservation_id = ?", id);
  check("the card is saved with only the last 4 of the ID", reg?.id_last4 === "5678" && !JSON.stringify(reg).includes("12345678") && reg?.coming_from === "Lagos", JSON.stringify(reg));

  await go(p, "/app/rooms");
  const tile = await p.$eval(`#room-${roomNo}`, (t) => t.innerText).catch(() => "");
  check("room board shows the room occupied by the guest", /Occupied|In house|Due out|Overdue/i.test(tile) && /Guest/.test(tile), tile.replace(/\s+/g, " "));

  // Check out: Key returned is required.
  await go(p, `/app/reservations/${id}`);
  await checkOutWithKey(p, { key: false });
  const disabled = await p.$$eval("[role=dialog] button", (bs) => bs.find((b) => b.innerText.trim() === "Check out")?.disabled);
  check("check-out waits for Key returned", disabled === true);
  await clickText(p, "[role=dialog] label", "Key returned");
  await clickText(p, "[role=dialog] button", "Check out");
  await waitForText(p, /Checked out/);
  check("front desk checks the guest out", (await val("SELECT status FROM reservations WHERE id = ?", id)) === "checked_out");
  check("room needs cleaning after check-out", (await val("SELECT readiness FROM rooms WHERE room_number = ?", roomNo)) === "needs_cleaning");
  const actions = (await val("SELECT group_concat(action, ',') FROM (SELECT action FROM activity_log WHERE entity_id = ? ORDER BY rowid)", id)) ?? "";
  check(
    "every step is in the activity log",
    ["reservation.created", "reservation.checked_in", "reservation.checked_out"].every((a) => actions.includes(a)),
    actions,
  );
  const who = await val("SELECT count(*) FROM payments WHERE reservation_id = ? AND recorded_by = (SELECT id FROM staff_profiles WHERE email = 'e2e-pin-frontdesk@victoria.test')", id);
  check("both payments are recorded against the person who signed in with their PIN", who === 2, String(who));
  await ctx.close();
}

{
  // Walk-in: guest, tonight's free room, the card, cash, checked in, in one go.
  const { ctx, p } = await as("front_desk");
  await go(p, "/app/walk-in");
  await p.waitForSelector("#phone", { visible: true });
  const phone = `0803${String(Date.now()).slice(-7)}`;
  await fill(p, "#phone", phone);
  await fill(p, "#name", "Walkin Tonight Guest");
  // A room type with a ready room tonight, then that room.
  const picked = await until(() => p.evaluate(() => {
    const t = [...document.querySelectorAll("section button[aria-pressed]")].find((b) => !b.disabled && /[1-9]\d* ready tonight/.test(b.innerText));
    if (!t) return null;
    t.click();
    return t.innerText.split("\n")[0];
  }), "a room type with a ready room", 15000).catch(() => null);
  check("walk-in shows tonight's room types with ready rooms", Boolean(picked));
  if (picked) {
    const room = await until(() => p.evaluate(() => {
      const section = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.includes("Room"));
      const b = [...(section?.querySelectorAll("button[aria-pressed]") ?? [])].find((x) => !x.disabled);
      if (!b) return null;
      b.click();
      return b.innerText.split("\n")[0];
    }), "a ready room");
    await fill(p, "#idNumber", "NIN99887766");
    await fill(p, "#address", "4 Arakale Road, Akure");
    await fill(p, "#comingFrom", "Ondo");
    await clickText(p, "label", "Guest has seen the house rules");
    await clickText(p, "button", "and check in");
    await waitPath(p, /^\/app\/reservations\/[0-9a-f-]{36}$/);
    const wid = p.url().split("?")[0].split("/").pop();
    const row = await one("SELECT r.status, r.source, rm.room_number, g.phone FROM reservations r JOIN rooms rm ON rm.id = r.room_id JOIN guests g ON g.id = r.guest_id WHERE r.id = ?", wid);
    check("walk-in: booked, paid and checked in to the chosen room", row?.status === "checked_in" && row?.room_number === room && row?.source === "walk_in", JSON.stringify(row));
    check("the phone is stored as +234…", row?.phone?.startsWith("+234"), row?.phone);
    check("the walk-in payment has a receipt", /RCT-/.test(new URL(p.url()).searchParams.get("paid") ?? ""), p.url());
    check("and the card has only the last 4 of the ID", (await val("SELECT id_last4 FROM guest_registrations WHERE reservation_id = ?", wid)) === "7766");
    // Leave the room as it was for other tests: check the guest out again directly.
    await run("UPDATE reservations SET status = 'checked_out' WHERE id = ?", wid).catch(() => {});
    await run("UPDATE rooms SET readiness = 'ready' WHERE room_number = ?", room).catch(() => {});
  }
  await ctx.close();
}

await finish();
