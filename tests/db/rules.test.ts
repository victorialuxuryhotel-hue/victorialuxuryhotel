import { describe, expect, it } from "vitest";
import { day, db, exec, insertReservation, iso, makeCategory, makeGuest, q, q1, rejects, status } from "./helpers";

/**
 * The hard rules enforced by the database itself (triggers and constraints),
 * exercised with raw writes, so they hold no matter what app code does.
 */

describe("room overlap", () => {
  it("rejects a second live reservation on the same room for overlapping nights", async () => {
    const c = await makeCategory(2);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(13), roomId: c.roomIds[0] });
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(12), checkOut: day(14), roomId: c.roomIds[0] }), /room_overlap/);
  });

  it("allows same-day turnover: one guest departs the day the next arrives", async () => {
    const c = await makeCategory(1);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(12), roomId: c.roomIds[0] });
    await insertReservation({ categoryId: c.id, checkIn: day(12), checkOut: day(14), roomId: c.roomIds[0] });
  });

  it("frees the room when a reservation is cancelled", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(12), roomId: c.roomIds[0] });
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", r);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(12), roomId: c.roomIds[0] });
  });

  it("counts awaiting-payment reservations as occupying their room", async () => {
    const c = await makeCategory(2);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(12), roomId: c.roomIds[0], status: "pending_payment" });
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(11), checkOut: day(12), roomId: c.roomIds[0] }), /room_overlap/);
  });

  it("lets exactly one of two simultaneous assignments of the same room succeed", async () => {
    const c = await makeCategory(2);
    const a = await insertReservation({ categoryId: c.id, checkIn: day(20), checkOut: day(22) });
    const b = await insertReservation({ categoryId: c.id, checkIn: day(21), checkOut: day(23) });
    const results = await Promise.allSettled([a, b].map((id) => exec("UPDATE reservations SET room_id = ? WHERE id = ?", c.roomIds[0], id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("room-type capacity", () => {
  it("refuses a booking that would oversell any night, counting only live reservations", async () => {
    const c = await makeCategory(2);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(12) });
    await insertReservation({ categoryId: c.id, checkIn: day(11), checkOut: day(13) });
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(11), checkOut: day(12) }), /no_capacity/);
    // Night 12 has only one live booking.
    await insertReservation({ categoryId: c.id, checkIn: day(12), checkOut: day(13) });
  });

  it("ignores lapsed holds immediately, before the clean-up job runs", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(11) });
    await exec("UPDATE reservations SET hold_expires_at = ? WHERE id = ?", iso(-1000), r);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(11) });
  });

  it("re-checks when an expired booking is revived by a late payment", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(11) });
    await exec("UPDATE reservations SET status = 'expired' WHERE id = ?", r);
    await insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(11), status: "confirmed" });
    await rejects(exec("UPDATE reservations SET status = 'confirmed' WHERE id = ?", r), /no_capacity/);
  });

  it("counts an upgraded booking against its room's category", async () => {
    const small = await makeCategory(1);
    const big = await makeCategory(1);
    const r = await insertReservation({ categoryId: small.id, checkIn: day(10), checkOut: day(11), status: "confirmed" });
    await exec("UPDATE reservations SET room_id = ? WHERE id = ?", big.roomIds[0], r);
    // The big category's only room is taken by the upgrade; the small one is free again.
    await rejects(insertReservation({ categoryId: big.id, checkIn: day(10), checkOut: day(11) }), /no_capacity/);
    await insertReservation({ categoryId: small.id, checkIn: day(10), checkOut: day(11) });
  });
});

describe("reservation integrity", () => {
  it("rejects check-out on or before check-in, and invalid dates", async () => {
    const c = await makeCategory(1);
    await rejects(insertReservation({ categoryId: c.id, checkIn: day(10), checkOut: day(10) }), /CHECK constraint/);
    await rejects(insertReservation({ categoryId: c.id, checkIn: "2026-02-30", checkOut: "2026-03-02" }), /CHECK constraint/);
  });

  it("rejects a total that does not equal rate × nights", async () => {
    const c = await makeCategory(1);
    const guest = await makeGuest();
    await rejects(
      exec(
        `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, source, hold_expires_at)
         VALUES (?, 'VL-ZZZZZ2', ?, ?, ?, ?, ?, 1, 100, 150, 'staff', ?)`,
        crypto.randomUUID(), crypto.randomUUID(), guest, c.id, day(10), day(12), iso(60_000),
      ),
      /CHECK constraint/,
    );
  });

  it("requires a room before check-in", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), status: "confirmed" });
    await rejects(exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r), /CHECK constraint/);
  });

  it("references are unique and human-friendly", async () => {
    const refs = await q<{ reference: string }>("SELECT reference FROM reservations");
    expect(new Set(refs.map((r) => r.reference)).size).toBe(refs.length);
    for (const { reference } of refs) expect(reference).toMatch(/^VL-[A-Z0-9]{6}$/);
  });
});

describe("reservation lifecycle", () => {
  it("allows valid transitions, stamps times, clears the hold, and records history", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), roomId: c.roomIds[0] });
    await exec("UPDATE reservations SET status = 'confirmed' WHERE id = ?", r);
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    await exec("UPDATE reservations SET status = 'checked_out' WHERE id = ?", r);
    const row = await q1<Record<string, string | null>>("SELECT confirmed_at, checked_in_at, checked_out_at, hold_expires_at FROM reservations WHERE id = ?", r);
    expect(row.confirmed_at && row.checked_in_at && row.checked_out_at).toBeTruthy();
    expect(row.hold_expires_at).toBeNull();
    const history = await q<{ from_status: string | null; to_status: string }>("SELECT from_status, to_status FROM reservation_status_history WHERE reservation_id = ? ORDER BY id", r);
    expect(history.map((h) => `${h.from_status}→${h.to_status}`)).toEqual([
      "null→pending_payment", "pending_payment→confirmed", "confirmed→checked_in", "checked_in→checked_out",
    ]);
  });

  it("rejects invalid transitions and final states", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6), status: "confirmed" });
    await rejects(exec("UPDATE reservations SET status = 'expired' WHERE id = ?", r), /invalid_transition/);
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", r);
    await rejects(exec("UPDATE reservations SET status = 'confirmed' WHERE id = ?", r), /invalid_transition/);
  });

  it("rejects creating a reservation directly as checked in", async () => {
    const c = await makeCategory(1);
    const guest = await makeGuest();
    await rejects(
      exec(
        `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source)
         VALUES (?, 'VL-ZZZZZ3', ?, ?, ?, ?, ?, ?, 1, 100, 100, 'checked_in', 'staff')`,
        crypto.randomUUID(), crypto.randomUUID(), guest, c.id, c.roomIds[0], day(0), day(1),
      ),
      /invalid_initial_status/,
    );
  });

  it("freezes stay details once a reservation is closed", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await exec("UPDATE reservations SET status = 'cancelled' WHERE id = ?", r);
    await rejects(exec("UPDATE reservations SET check_out = ?, total_amount_kobo = 10000000 WHERE id = ?", day(7), r), /reservation_closed/);
    // Notes and flags can still change.
    await exec("UPDATE reservations SET attention_reason = 'x' WHERE id = ?", r);
  });

  it("bumps the version on every change (optimistic concurrency)", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    const v0 = (await q1<{ version: number }>("SELECT version FROM reservations WHERE id = ?", r)).version;
    await exec("UPDATE reservations SET special_requests = 'a' WHERE id = ?", r);
    await exec("UPDATE reservations SET status = 'confirmed' WHERE id = ?", r);
    const v1 = (await q1<{ version: number }>("SELECT version FROM reservations WHERE id = ?", r)).version;
    expect(v1).toBeGreaterThanOrEqual(v0 + 2);
    expect(await status(r)).toBe("confirmed");
  });
});

describe("payments", () => {
  const offline = (reservationId: string, amount: number, extra = "") =>
    exec(
      `INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by${extra ? ", provider_reference" : ""})
       VALUES (?, ?, ?, 'offline', 'cash', 'successful', ?, ?, '00000000-0000-4000-8000-0000000000a3'${extra ? ", ?" : ""})`,
      ...[crypto.randomUUID(), reservationId, amount, iso(0), iso(0), ...(extra ? [extra] : [])],
    );

  it("assigns sequential receipt numbers and makes a successful payment immutable", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await offline(r, 100);
    await offline(r, 200);
    const pays = await q<{ id: string; receipt_number: string }>("SELECT id, receipt_number FROM payments WHERE reservation_id = ? ORDER BY receipt_number", r);
    const [a, b] = pays.map((p) => Number(p.receipt_number.slice(-6)));
    expect(pays[0]!.receipt_number).toMatch(/^RCT-\d{4}-\d{6}$/);
    expect(b).toBe(a! + 1);
    await rejects(exec("UPDATE payments SET amount_kobo = 1 WHERE id = ?", pays[0]!.id), /payment_immutable/);
    await rejects(exec("UPDATE payments SET status = 'failed' WHERE id = ?", pays[0]!.id), /payment_immutable/);
  });

  it("refuses a successful payment without verification, or an offline one without staff", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await rejects(
      exec("INSERT INTO payments (id, reservation_id, amount_kobo, provider, provider_reference, status) VALUES (?, ?, 100, 'paystack', 'x1', 'successful')", crypto.randomUUID(), r),
      /CHECK constraint/,
    );
    await rejects(
      exec("INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at) VALUES (?, ?, 100, 'offline', 'cash', 'successful', ?, ?)", crypto.randomUUID(), r, iso(0), iso(0)),
      /CHECK constraint/,
    );
  });

  it("rejects a duplicate provider reference, and a reopened attempt", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await offline(r, 100, "TRF-1");
    await rejects(offline(r, 100, "TRF-1"), /UNIQUE constraint/);
    const id = crypto.randomUUID();
    await exec("INSERT INTO payments (id, reservation_id, amount_kobo, provider, provider_reference, status) VALUES (?, ?, 100, 'paystack', ?, 'failed')", id, r, `ref-${id}`);
    await rejects(exec("UPDATE payments SET status = 'pending' WHERE id = ?", id), /payment_closed/);
  });

  it("stores identical webhook deliveries once", async () => {
    const insert = () => exec("INSERT INTO payment_events (provider, event_type, payload_hash, payload) VALUES ('paystack', 'charge.success', 'hash-dup-1', '{}')");
    await insert();
    await rejects(insert(), /UNIQUE constraint/);
  });

  it("gapless receipts: a failed batch rolls back its receipt number", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await offline(r, 100);
    const before = await q1<{ n: number }>("SELECT max(last_number) AS n FROM receipt_counters");
    await rejects(
      db.batch([
        db.prepare(
          "INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by) VALUES (?, ?, 100, 'offline', 'cash', 'successful', ?, ?, '00000000-0000-4000-8000-0000000000a3')",
        ).bind(crypto.randomUUID(), r, iso(0), iso(0)),
        db.prepare("INSERT INTO _guard (ok) VALUES (0)"), // forces the batch to fail
      ]),
      /stale_state/,
    );
    await offline(r, 100);
    const after = await q1<{ n: number }>("SELECT max(last_number) AS n FROM receipt_counters");
    expect(after.n).toBe(before.n + 1);
  });

  it("receipt numbers stay unique under concurrent payments", async () => {
    const c = await makeCategory(1);
    const r = await insertReservation({ categoryId: c.id, checkIn: day(5), checkOut: day(6) });
    await Promise.all(Array.from({ length: 10 }, () => offline(r, 10)));
    const receipts = await q<{ receipt_number: string }>("SELECT receipt_number FROM payments WHERE reservation_id = ?", r);
    expect(new Set(receipts.map((x) => x.receipt_number)).size).toBe(10);
  });
});

describe("activity log and staff", () => {
  it("the activity log is append-only", async () => {
    await rejects(exec("UPDATE activity_log SET summary = 'x'"), /activity_log_immutable/);
    await rejects(exec("DELETE FROM activity_log"), /activity_log_immutable/);
  });

  it("always keeps an active owner, and staff are never deleted", async () => {
    await rejects(exec("UPDATE staff_profiles SET is_active = 0 WHERE role = 'owner'"), /last_owner/);
    await rejects(exec("DELETE FROM staff_profiles"), /staff_delete_forbidden/);
  });

  it("room types and rooms can't be deleted (deactivate instead)", async () => {
    const c = await makeCategory(1);
    await rejects(exec("DELETE FROM rooms WHERE id = ?", c.roomIds[0]), /delete_forbidden/);
    await rejects(exec("DELETE FROM room_categories WHERE id = ?", c.id), /delete_forbidden/);
  });
});
