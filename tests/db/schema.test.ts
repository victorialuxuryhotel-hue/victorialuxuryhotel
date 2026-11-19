import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, expectDbError, futureDate, insertReservation, makeRoom, type Sql } from "./helpers";

let sql: Sql;
beforeAll(() => {
  sql = connect();
});
afterAll(async () => {
  await sql.end();
});

describe("room assignment overlap (exclusion constraint)", () => {
  it("rejects a second live reservation on the same room for overlapping nights", async () => {
    const room = await makeRoom(sql, "standard");
    await insertReservation(sql, { roomId: room, checkIn: futureDate(0), checkOut: futureDate(3) });
    await expectDbError(
      insertReservation(sql, { roomId: room, checkIn: futureDate(2), checkOut: futureDate(4) }),
      /reservations_no_room_overlap/,
    );
  });

  it("allows same-day turnover: one guest departs the day the next arrives", async () => {
    const room = await makeRoom(sql, "standard");
    await insertReservation(sql, { roomId: room, checkIn: futureDate(10), checkOut: futureDate(12) });
    await expect(insertReservation(sql, { roomId: room, checkIn: futureDate(12), checkOut: futureDate(14) })).resolves.toBeTruthy();
  });

  it("frees the room when a reservation is cancelled", async () => {
    const room = await makeRoom(sql, "standard");
    const first = await insertReservation(sql, { roomId: room, checkIn: futureDate(20), checkOut: futureDate(22) });
    await sql`update reservations set status = 'cancelled' where id = ${first.id}`;
    await expect(insertReservation(sql, { roomId: room, checkIn: futureDate(20), checkOut: futureDate(22) })).resolves.toBeTruthy();
  });

  it("counts pending-payment reservations as occupying their room", async () => {
    const room = await makeRoom(sql, "standard");
    await insertReservation(sql, { roomId: room, status: "pending_payment", checkIn: futureDate(30), checkOut: futureDate(31) });
    await expectDbError(
      insertReservation(sql, { roomId: room, checkIn: futureDate(30), checkOut: futureDate(31) }),
      /reservations_no_room_overlap/,
    );
  });

  it("lets exactly one of two concurrent assignments of the same room succeed", async () => {
    const room = await makeRoom(sql, "standard");
    const a = await insertReservation(sql, { checkIn: futureDate(40), checkOut: futureDate(42) });
    const b = await insertReservation(sql, { checkIn: futureDate(41), checkOut: futureDate(43) });
    const results = await Promise.allSettled([
      sql`update reservations set room_id = ${room} where id = ${a.id}`,
      sql`update reservations set room_id = ${room} where id = ${b.id}`,
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

describe("reservation integrity", () => {
  it("rejects check-out on or before check-in", async () => {
    await expectDbError(insertReservation(sql, { checkIn: futureDate(50), checkOut: futureDate(50) }), /reservations_dates_valid/);
  });

  it("rejects a total that does not equal rate × nights", async () => {
    const [cat] = await sql`select id from room_categories where slug = 'standard'`;
    const [guest] = await sql`insert into guests (full_name) values ('Walk In') returning id`;
    await expectDbError(
      sql`insert into reservations (guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source)
          values (${guest!.id}, ${cat!.id}, ${futureDate(51)}, ${futureDate(53)}, 1, 1000000, 1000000, 'confirmed', 'walk_in')`,
      /reservations_total_matches/,
    );
  });

  it("requires a room before check-in", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(55), checkOut: futureDate(56) });
    await expectDbError(sql`update reservations set status = 'checked_in' where id = ${r.id}`, /reservations_in_house_has_room/);
  });

  it("generates unique human-friendly references", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(57), checkOut: futureDate(58) });
    expect(r.reference).toMatch(/^VL-[A-HJKMNP-Z2-9]{6}$/);
  });
});

describe("reservation lifecycle", () => {
  it("allows valid transitions and records history", async () => {
    const room = await makeRoom(sql, "deluxe");
    const r = await insertReservation(sql, { slug: "deluxe", roomId: room, status: "pending_payment", checkIn: futureDate(60), checkOut: futureDate(61) });
    await sql`update reservations set status = 'confirmed' where id = ${r.id}`;
    await sql`update reservations set status = 'checked_in' where id = ${r.id}`;
    await sql`update reservations set status = 'checked_out' where id = ${r.id}`;
    const history = await sql`select from_status, to_status from reservation_status_history where reservation_id = ${r.id} order by id`;
    expect(history.map((h) => `${h.from_status ?? "-"}>${h.to_status}`)).toEqual([
      "->pending_payment",
      "pending_payment>confirmed",
      "confirmed>checked_in",
      "checked_in>checked_out",
    ]);
    const [row] = await sql`select confirmed_at, checked_in_at, checked_out_at, hold_expires_at from reservations where id = ${r.id}`;
    expect(row!.confirmed_at).not.toBeNull();
    expect(row!.checked_out_at).not.toBeNull();
    expect(row!.hold_expires_at).toBeNull();
  });

  it.each([
    ["pending_payment", "checked_in"],
    ["confirmed", "pending_payment"],
    ["confirmed", "checked_out"],
    ["cancelled", "confirmed"],
  ] as const)("rejects %s → %s", async (from, to) => {
    const r = await insertReservation(sql, { status: from === "cancelled" ? "confirmed" : from, checkIn: futureDate(70), checkOut: futureDate(71) });
    if (from === "cancelled") await sql`update reservations set status = 'cancelled' where id = ${r.id}`;
    await expectDbError(sql`update reservations set status = ${to} where id = ${r.id}`, /Invalid reservation status change|in_house_has_room/);
  });

  it("rejects creating a reservation directly as checked in", async () => {
    const room = await makeRoom(sql, "standard");
    const [cat] = await sql`select id from room_categories where slug = 'standard'`;
    const [guest] = await sql`insert into guests (full_name) values ('Walk In') returning id`;
    await expectDbError(
      sql`insert into reservations (guest_id, category_id, room_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo, status, source)
          values (${guest!.id}, ${cat!.id}, ${room}, ${futureDate(72)}, ${futureDate(73)}, 1, 1000, 1000, 'checked_in', 'walk_in')`,
      /must start as pending_payment or confirmed/,
    );
  });

  it("freezes stay details once a reservation is closed", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(74), checkOut: futureDate(75) });
    await sql`update reservations set status = 'cancelled' where id = ${r.id}`;
    await expectDbError(sql`update reservations set check_out = ${futureDate(76)}, total_amount_kobo = 2000000 where id = ${r.id}`, /is closed/);
  });
});

describe("payments", () => {
  it("assigns a receipt number on success and makes the payment immutable", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(80), checkOut: futureDate(81) });
    const [p] = await sql`
      insert into payments (reservation_id, amount_kobo, provider, provider_reference, status)
      values (${r.id}, 1000000, 'paystack', ${"ref-" + r.id}, 'pending') returning id, receipt_number`;
    expect(p!.receipt_number).toBeNull();
    const [done] = await sql`
      update payments set status = 'successful', paid_at = now(), verified_at = now() where id = ${p!.id} returning receipt_number`;
    expect(done!.receipt_number).toMatch(/^RCT-\d{4}-\d{6}$/);
    await expectDbError(sql`update payments set amount_kobo = 1 where id = ${p!.id}`, /immutable/);
  });

  it("refuses a successful payment without verification", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(82), checkOut: futureDate(83) });
    await expectDbError(
      sql`insert into payments (reservation_id, amount_kobo, provider, provider_reference, status) values (${r.id}, 100, 'paystack', ${"x-" + r.id}, 'successful')`,
      /payments_success_is_verified/,
    );
  });

  it("refuses an offline payment with no staff member recorded", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(84), checkOut: futureDate(85) });
    await expectDbError(
      sql`insert into payments (reservation_id, amount_kobo, provider, method, status) values (${r.id}, 100, 'offline', 'cash', 'pending')`,
      /payments_offline_recorded_by_staff/,
    );
  });

  it("rejects a duplicate provider reference", async () => {
    const r = await insertReservation(sql, { checkIn: futureDate(86), checkOut: futureDate(87) });
    const ref = "dup-" + r.id;
    await sql`insert into payments (reservation_id, amount_kobo, provider, provider_reference) values (${r.id}, 100, 'paystack', ${ref})`;
    await expectDbError(
      sql`insert into payments (reservation_id, amount_kobo, provider, provider_reference) values (${r.id}, 100, 'paystack', ${ref})`,
      /payments_provider_reference_key/,
    );
  });

  it("deduplicates identical webhook deliveries", async () => {
    const hash = "hash-" + Math.random();
    await sql`insert into payment_events (provider, event_type, payload_hash, payload) values ('paystack', 'charge.success', ${hash}, '{}')`;
    await expectDbError(
      sql`insert into payment_events (provider, event_type, payload_hash, payload) values ('paystack', 'charge.success', ${hash}, '{}')`,
      /payment_events_payload_hash_key/,
    );
  });
});

describe("activity log", () => {
  it("is append-only", async () => {
    const [row] = await sql`insert into activity_log (actor_type, action, entity_type, summary) values ('system', 'test.event', 'test', 'x') returning id`;
    await expectDbError(sql`update activity_log set summary = 'changed' where id = ${row!.id}`, /cannot be modified/);
    await expectDbError(sql`delete from activity_log where id = ${row!.id}`, /cannot be modified/);
  });
});
