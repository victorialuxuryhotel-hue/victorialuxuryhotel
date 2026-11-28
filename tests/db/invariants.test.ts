// docs/rules-and-edge-cases.md, section 3: states the database must make impossible.
// Each test goes around the app and tries to break one rule with plain SQL, and expects the rule's own error.

import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db";
import { applyPaystackResult, beginPaystackPayment, recordOfflinePayment } from "@/server/domain/payments";
import { saveMenuItem, saveOrder } from "@/server/domain/pos";
import { createWebsiteReservation } from "@/server/domain/reservations";
import { day, desk, db, exec, insertReservation, iso, makeCategory, q1, rejects } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 8);

/** A paid booking with a room, checked in. */
async function checkedIn(categoryId: string, roomId: string, checkIn = day(0), checkOut = day(1)) {
  const id = await insertReservation({ categoryId, checkIn, checkOut, status: "confirmed" });
  await exec("UPDATE reservations SET room_id = ? WHERE id = ?", roomId, id);
  await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", id);
  return id;
}

describe("section 3 invariants", () => {
  it("I1 two checked-in bookings on one room is rejected", async () => {
    const c = await makeCategory(2);
    await checkedIn(c.id, c.roomIds[0]!, day(-3), day(-1)); // overstaying
    const other = await checkedIn(c.id, c.roomIds[1]!);
    await rejects(exec("UPDATE reservations SET room_id = ? WHERE id = ?", c.roomIds[0], other), /room_overlap/);
  });

  it("I2 a room given to two live bookings on the same night is rejected", async () => {
    const c = await makeCategory(2);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(12), roomId: c.roomIds[0], status: "confirmed" });
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(11), checkOut: day(13), roomId: c.roomIds[0], status: "confirmed" }), /room_overlap/);
  });

  it("I3 checking in or out with money owed is rejected", async () => {
    const c = await makeCategory(1);
    const unpaid = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed", unpaid: true });
    await exec("UPDATE reservations SET room_id = ? WHERE id = ?", c.roomIds[0], unpaid);
    await rejects(exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", unpaid), /not_paid/);

    const c2 = await makeCategory(1);
    const stay = await checkedIn(c2.id, c2.roomIds[0]!);
    await exec("UPDATE reservations SET extras_kobo = extras_kobo + 500000 WHERE id = ?", stay);
    await rejects(exec("UPDATE reservations SET status = 'checked_out' WHERE id = ?", stay), /not_paid/);
  });

  it("I4 a booking awaiting payment with a room is rejected", async () => {
    const c = await makeCategory(1);
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6), roomId: c.roomIds[0] }), /room_before_payment/);
    const held = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await rejects(exec("UPDATE reservations SET room_id = ? WHERE id = ?", c.roomIds[0], held), /room_before_payment/);
  });

  it("I5 more live bookings in a room type than rooms in service is rejected", async () => {
    const c = await makeCategory(1);
    await insertReservation({ categoryId: c.id, checkIn: day(20), checkOut: day(22), status: "confirmed" });
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(21), checkOut: day(22), status: "confirmed" }), /no_capacity/);
  });

  it("I6 a successful payment can't be changed or deleted", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6), status: "confirmed" });
    const { id } = await q1<{ id: string }>("SELECT id FROM payments WHERE reservation_id = ?", r);
    await rejects(exec("UPDATE payments SET amount_kobo = 1 WHERE id = ?", id), /payment_immutable/);
    await rejects(exec("DELETE FROM payments WHERE id = ?", id), /payment_immutable/);
  });

  it("I7 a payment without method, staff, verification or (for a transfer) a reference is rejected", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    const insert = (provider: string, method: string | null, reference: string | null, recordedBy: string | null, verifiedAt: string | null) =>
      exec(
        `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by)
         VALUES (?, ?, 100, ?, ?, ?, 'successful', ?, ?, ?)`,
        crypto.randomUUID(), r, provider, method, reference, iso(0), verifiedAt, recordedBy,
      );
    await rejects(insert("offline", "bank_transfer", null, desk!.id, iso(0)), /payment_incomplete/);
    await rejects(insert("offline", "bank_transfer", " ", desk!.id, iso(0)), /payment_incomplete/);
    await rejects(insert("offline", "cash", null, null, iso(0)), /payment_incomplete|CHECK constraint/);
    await rejects(insert("paystack", "card", `ps-${rand()}`, null, null), /payment_incomplete|CHECK constraint/);
    await rejects(
      recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "bank_transfer", reference: "", paidOn: day(0), confirmReceived: true }),
      /transfer reference or the sender's name/,
      "VALIDATION",
    );

    const hall = crypto.randomUUID();
    await exec("INSERT INTO hall_bookings (id, title, customer_name, event_date, start_time, end_time, price_kobo) VALUES (?, 'Test', 'Acme', ?, '09:00', '10:00', 100000)", hall, day(400));
    await rejects(
      exec("INSERT INTO hall_payments (id, booking_id, amount_kobo, method, paid_on, recorded_by) VALUES (?, ?, 1000, 'bank_transfer', ?, ?)", crypto.randomUUID(), hall, day(0), desk!.id),
      /payment_incomplete/,
    );
  });

  it("I8 paying more than the total is recorded (it's real money) and flagged for a refund, not blocked", async () => {
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const b = await createWebsiteReservation(db, {
      categorySlug: c.slug, checkIn: day(30), checkOut: day(31), guests: 1, fullName: "Twice Paid", email: `twice-${rand()}@example.com`, phone: "+2348000000020",
    });
    const online = await beginPaystackPayment(db, b.publicToken);
    await recordOfflinePayment(db, desk, { reservationId: b.id, amountKobo: online.amountKobo, method: "cash", paidOn: day(0), confirmReceived: true });
    const outcome = await applyPaystackResult(db, { reference: online.reference, status: "success", amountKobo: online.amountKobo, currency: "NGN", paidAt: iso(0), channel: "card", gatewayResponse: "Approved" });
    expect(outcome).toBe("overpaid");
    const row = await q1<{ n: number; attention: string }>(
      "SELECT (SELECT count(*) FROM payments WHERE reservation_id = r.id AND status = 'successful') AS n, attention_reason AS attention FROM reservations r WHERE id = ?",
      b.id,
    );
    expect(row.n).toBe(2);
    expect(row.attention).toMatch(/Overpaid by ₦50,000.*Refund the difference/);
  });

  it("I9 a hall booking confirmed without a price or before it's paid in full is rejected", async () => {
    const id = crypto.randomUUID();
    await rejects(
      exec("INSERT INTO hall_bookings (id, title, customer_name, event_date, start_time, end_time, price_kobo, status) VALUES (?, 'Gala', 'Acme', ?, '09:00', '10:00', 0, 'confirmed')", id, day(401)),
      /hall_not_paid/,
    );
    await exec("INSERT INTO hall_bookings (id, title, customer_name, event_date, start_time, end_time, price_kobo) VALUES (?, 'Gala', 'Acme', ?, '09:00', '10:00', 0)", id, day(401));
    await rejects(exec("UPDATE hall_bookings SET status = 'confirmed' WHERE id = ?", id), /hall_not_paid/);
    await exec("UPDATE hall_bookings SET price_kobo = 200000 WHERE id = ?", id);
    await exec("INSERT INTO hall_payments (id, booking_id, amount_kobo, method, paid_on, recorded_by) VALUES (?, ?, 100000, 'cash', ?, ?)", crypto.randomUUID(), id, day(0), desk!.id);
    await rejects(exec("UPDATE hall_bookings SET status = 'confirmed' WHERE id = ?", id), /hall_not_paid/);
    await exec("INSERT INTO hall_payments (id, booking_id, amount_kobo, method, paid_on, recorded_by) VALUES (?, ?, 100000, 'cash', ?, ?)", crypto.randomUUID(), id, day(0), desk!.id);
    await exec("UPDATE hall_bookings SET status = 'confirmed' WHERE id = ?", id);
    await rejects(exec("UPDATE hall_bookings SET price_kobo = 300000 WHERE id = ?", id), /hall_not_paid/);
  });

  it("I10 a bar order paid by transfer needs the reference or sender's name, and the bank-app tick", async () => {
    const seller: Actor = { id: crypto.randomUUID(), role: "restaurant_bar_manager" };
    await exec(
      "INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead) VALUES (?, 'Bar Lead', ?, 'front_desk', 'restaurant_bar', 1)",
      seller!.id, `bar-${rand()}@example.com`,
    );
    const item = await saveMenuItem(db, seller, { name: `Zobo ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 100_000, available: true, active: true });
    const order = await saveOrder(db, seller, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: item, quantity: 1 }] });
    const pay = (ref: string | null, sender: string | null = null, seen = 1) =>
      exec(
        `UPDATE pos_orders SET status = 'paid', method = 'bank_transfer', payment_reference = ?, sender_name = ?, seen_in_bank_app = ?, paid_by = ?, paid_at = ?, receipt_number = ? WHERE id = ?`,
        ref, sender, seen, seller!.id, iso(0), `RB-T-${rand()}`, order.id,
      );
    await rejects(pay(null), /payment_needs_reference/);
    await rejects(pay("  "), /payment_needs_reference/);
    await rejects(pay("4821", null, 0), /payment_needs_reference/); // not seen in the bank app
    await pay(null, "Kunle Ade"); // the sender's name is enough
  });

  it("I15 a bar order paid by POS/card without the slip's last 4 digits is rejected", async () => {
    const seller: Actor = { id: crypto.randomUUID(), role: "restaurant_bar_manager" };
    await exec(
      "INSERT INTO staff_profiles (id, full_name, email, role, department, department_lead) VALUES (?, 'Bar Lead', ?, 'front_desk', 'restaurant_bar', 1)",
      seller!.id, `bar-${rand()}@example.com`,
    );
    const item = await saveMenuItem(db, seller, { name: `Malt ${rand()}`, outlet: "bar", category: "soft_drinks", priceKobo: 100_000, available: true, active: true });
    const order = await saveOrder(db, seller, { id: crypto.randomUUID(), outlet: "bar", lines: [{ menuItemId: item, quantity: 1 }] });
    const pay = (slip: string | null, terminal: string | null = "Bar terminal") =>
      exec(
        `UPDATE pos_orders SET status = 'paid', method = 'pos_terminal', slip_last4 = ?, terminal = ?, paid_by = ?, paid_at = ?, receipt_number = ? WHERE id = ?`,
        slip, terminal, seller!.id, iso(0), `RB-T-${rand()}`, order.id,
      );
    await rejects(pay(null), /payment_needs_reference/);
    await rejects(pay("12a4"), /CHECK constraint/);
    await rejects(pay("1234", null), /payment_needs_reference/); // which terminal
    await pay("1234");
  });

  it("I16 a desk payment by POS/card without the slip's last 4 digits is rejected; slips may repeat", async () => {
    const c = await makeCategory(2);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    const r2 = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    const insert = (reservationId: string, slip: string | null, terminal: string | null = "Front desk terminal") =>
      exec(
        `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, slip_last4, terminal, status, paid_at, verified_at, recorded_by)
         VALUES (?, ?, 100, 'offline', 'pos_terminal', ?, ?, 'successful', ?, ?, ?)`,
        crypto.randomUUID(), reservationId, slip, terminal, iso(0), iso(0), desk!.id,
      );
    await rejects(insert(r, null), /payment_incomplete/);
    await rejects(insert(r, "slip"), /CHECK constraint/);
    await rejects(insert(r, "7731", null), /payment_incomplete/);
    await insert(r, "7731");
    await insert(r2, "7731"); // two genuine slips can end in the same 4 digits
    await rejects(
      recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "pos_terminal", slipLast4: "", terminal: "Front desk terminal", paidOn: day(0), confirmReceived: true }),
      /last 4 digits of the POS slip/,
      "VALIDATION",
    );
  });

  it("I11 a closing can't be edited, deleted or made twice for one person and business day", async () => {
    const id = crypto.randomUUID();
    const date = day(-(500 + Math.floor(Math.random() * 500)));
    const insert = (closingId: string) =>
      exec("INSERT INTO pos_closings (id, business_date, staff_id, summary, expected_cash_kobo, counted_cash_kobo) VALUES (?, ?, ?, '{}', 0, 0)", closingId, date, desk!.id);
    await insert(id);
    await rejects(insert(crypto.randomUUID()), /UNIQUE constraint/);
    await rejects(exec("UPDATE pos_closings SET counted_cash_kobo = 100 WHERE id = ?", id), /closing_immutable/);
    await rejects(exec("DELETE FROM pos_closings WHERE id = ?", id), /closing_immutable/);
  });

  it("I12 activity, status history and money records can't be deleted", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6), status: "confirmed" });
    await rejects(exec("DELETE FROM activity_log WHERE id = (SELECT max(id) FROM activity_log)"), /activity_log_immutable/);
    await rejects(exec("DELETE FROM reservation_status_history WHERE reservation_id = ?", r), /history_immutable/);
    await rejects(exec("DELETE FROM payments WHERE reservation_id = ?", r), /payment_immutable/);
  });

  it("I13 writing to the retired sales table (charge to room) is rejected", async () => {
    await rejects(
      exec("INSERT INTO sales (id, number, outlet, total_kobo, status, method, sold_by) VALUES (?, ?, 'bar', 1000, 'paid', 'cash', ?)", crypto.randomUUID(), Math.floor(Math.random() * 1e9), desk!.id),
      /sales_retired/,
    );
  });

  it("I14 removing the last active owner is rejected", async () => {
    await rejects(exec("UPDATE staff_profiles SET is_active = 0 WHERE role = 'owner'"), /last_owner/);
  });
});
