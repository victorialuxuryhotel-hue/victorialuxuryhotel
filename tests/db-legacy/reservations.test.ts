import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, makeUser, type TestUser } from "./api-helpers";

/**
 * Reservation engine, exercised through the real API as the website server
 * (service role), front desk, general manager and anonymous visitors.
 * Each test builds its own room category so capacity numbers are exact.
 */

let desk: TestUser, gm: TestUser;
let today: string;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function makeCategory(rooms: number, opts: { rate?: number; occupancy?: number } = {}) {
  const tag = randomUUID().slice(0, 8);
  const { data: cat, error } = await admin
    .from("room_categories")
    .insert({ slug: `t-${tag}`, name: `Test ${tag}`, nightly_rate_kobo: opts.rate ?? 2_500_000, max_occupancy: opts.occupancy ?? 2 })
    .select("id, slug")
    .single();
  if (error) throw error;
  const { data: roomRows } = await admin
    .from("rooms")
    .insert(Array.from({ length: rooms }, (_, i) => ({ room_number: `${tag.slice(0, 5)}${i}`, category_id: cat.id })))
    .select("id, room_number");
  return { id: cat.id, slug: cat.slug, rooms: roomRows! };
}

function website(slug: string, checkIn: string, checkOut: string, extra: Partial<{ guests: number; email: string; name: string; phone: string }> = {}) {
  return admin.rpc("create_website_reservation", {
    p_category_slug: slug, p_check_in: checkIn, p_check_out: checkOut, p_guests: extra.guests ?? 2,
    p_full_name: extra.name ?? "Web Guest", p_email: extra.email ?? `web-${randomUUID().slice(0, 8)}@example.com`,
    p_phone: extra.phone ?? "+2348000000001",
  });
}

function staffBooking(who: TestUser, categoryId: string, checkIn: string, checkOut: string, extra: Partial<{ guests: number }> = {}) {
  return who.client.rpc("create_staff_reservation", {
    p_category_id: categoryId, p_check_in: checkIn, p_check_out: checkOut, p_guests: extra.guests ?? 1,
    p_source: "walk_in", p_full_name: "Walk-in Guest", p_phone: "+2348000000002",
  });
}

async function available(slug: string, checkIn: string, checkOut: string, guests = 1) {
  const { data, error } = await anon().rpc("search_availability", { p_check_in: checkIn, p_check_out: checkOut, p_guests: guests });
  if (error) throw error;
  return data.find((c) => c.slug === slug)?.is_available;
}

const confirm = (id: string) => admin.from("reservations").update({ status: "confirmed" }).eq("id", id);

beforeAll(async () => {
  [desk, gm] = await Promise.all([makeUser("front_desk"), makeUser("general_manager")]);
  const { data } = await admin.rpc("hotel_today");
  today = data as unknown as string;
});

describe("availability search (public)", () => {
  it("returns prices and a yes/no flag, never room counts", async () => {
    const { data, error } = await anon().rpc("search_availability", { p_check_in: addDays(today, 30), p_check_out: addDays(today, 32), p_guests: 2 });
    expect(error).toBeNull();
    const standard = data!.find((c) => c.slug === "standard")!;
    expect(standard.nights).toBe(2);
    expect(standard.total_kobo).toBe(standard.nightly_rate_kobo * 2);
    expect(Object.keys(standard).sort()).toEqual(
      ["category_id", "is_available", "max_occupancy", "name", "nightly_rate_kobo", "nights", "short_description", "slug", "total_kobo"].sort(),
    );
  });

  it.each([
    ["in the past", -1, 1],
    ["check-out before check-in", 5, 4],
    ["longer than 90 nights", 1, 95],
  ])("rejects dates %s", async (_, inOffset, outOffset) => {
    const { error } = await anon().rpc("search_availability", { p_check_in: addDays(today, inOffset), p_check_out: addDays(today, outOffset), p_guests: 1 });
    expect(error?.hint).toBe("VALIDATION");
  });

  it("marks a category unavailable when the party is larger than it sleeps", async () => {
    const cat = await makeCategory(2, { occupancy: 2 });
    expect(await available(cat.slug, addDays(today, 40), addDays(today, 41), 3)).toBe(false);
  });
});

describe("capacity", () => {
  it("sells exactly the number of rooms, then reports unavailable", async () => {
    const cat = await makeCategory(2);
    const [a, b] = [addDays(today, 50), addDays(today, 52)];
    expect((await website(cat.slug, a, b)).error).toBeNull();
    expect((await website(cat.slug, a, b)).error).toBeNull();
    const third = await website(cat.slug, a, b);
    expect(third.error?.hint).toBe("UNAVAILABLE");
    expect(await available(cat.slug, a, b)).toBe(false);
  });

  it("treats check-out day as free for the next arrival", async () => {
    const cat = await makeCategory(1);
    expect((await website(cat.slug, addDays(today, 60), addDays(today, 62))).error).toBeNull();
    expect(await available(cat.slug, addDays(today, 62), addDays(today, 63))).toBe(true);
    expect(await available(cat.slug, addDays(today, 61), addDays(today, 63))).toBe(false);
  });

  it("releases inventory the moment a hold lapses, before the clean-up job runs", async () => {
    const cat = await makeCategory(1);
    const [a, b] = [addDays(today, 70), addDays(today, 71)];
    const { data } = await website(cat.slug, a, b);
    expect(await available(cat.slug, a, b)).toBe(false);
    await admin.from("reservations").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", data![0]!.id);
    expect(await available(cat.slug, a, b)).toBe(true);
  });

  it("excludes rooms under maintenance", async () => {
    const cat = await makeCategory(1);
    await gm.client.rpc("update_room_status", { p_room_id: cat.rooms[0]!.id, p_service_status: "maintenance", p_note: "Leak" });
    expect(await available(cat.slug, addDays(today, 80), addDays(today, 81))).toBe(false);
  });

  it("frees inventory when a reservation is cancelled", async () => {
    const cat = await makeCategory(1);
    const [a, b] = [addDays(today, 90), addDays(today, 91)];
    const { data } = await staffBooking(desk, cat.id, a, b);
    expect(await available(cat.slug, a, b)).toBe(false);
    expect((await desk.client.rpc("cancel_reservation", { p_reservation_id: data![0]!.id, p_reason: "Guest changed plans" })).error).toBeNull();
    expect(await available(cat.slug, a, b)).toBe(true);
  });

  it("never oversells under simultaneous booking attempts", async () => {
    const cat = await makeCategory(3);
    const [a, b] = [addDays(today, 100), addDays(today, 102)];
    const results = await Promise.all(Array.from({ length: 12 }, () => website(cat.slug, a, b)));
    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(results.filter((r) => r.error?.hint === "UNAVAILABLE")).toHaveLength(9);
    const { count } = await admin.from("reservations").select("id", { count: "exact", head: true }).eq("category_id", cat.id);
    expect(count).toBe(3);
  });
});

describe("creating reservations", () => {
  it("prices on the server from the category rate, ignoring anything the client might send", async () => {
    const cat = await makeCategory(1, { rate: 3_300_000 });
    const { data } = await website(cat.slug, addDays(today, 110), addDays(today, 113));
    expect(data![0]!.total_amount_kobo).toBe(3_300_000 * 3);
    const { data: row } = await admin.from("reservations").select("status, source, created_by, hold_expires_at").eq("id", data![0]!.id).single();
    expect(row).toMatchObject({ status: "pending_payment", source: "website", created_by: null });
    const holdMinutes = (Date.parse(row!.hold_expires_at!) - Date.now()) / 60_000;
    expect(holdMinutes).toBeGreaterThan(25);
    expect(holdMinutes).toBeLessThanOrEqual(30);
  });

  it("keeps the price agreed at booking when the rate later changes", async () => {
    const cat = await makeCategory(1, { rate: 1_000_000 });
    const { data } = await website(cat.slug, addDays(today, 115), addDays(today, 116));
    await admin.from("room_categories").update({ nightly_rate_kobo: 9_000_000 }).eq("id", cat.id);
    const { data: row } = await admin.from("reservations").select("total_amount_kobo").eq("id", data![0]!.id).single();
    expect(row!.total_amount_kobo).toBe(1_000_000);
  });

  it("requires email and phone on the website", async () => {
    const cat = await makeCategory(1);
    const { error } = await website(cat.slug, addDays(today, 120), addDays(today, 121), { email: "" });
    expect(error?.hint).toBe("VALIDATION");
  });

  it("links a returning guest by email without letting a booking overwrite their name", async () => {
    const cat = await makeCategory(2);
    const email = `returning-${randomUUID().slice(0, 6)}@example.com`;
    const first = await website(cat.slug, addDays(today, 130), addDays(today, 131), { email, name: "Real Name" });
    const second = await website(cat.slug, addDays(today, 140), addDays(today, 141), { email: email.toUpperCase(), name: "Someone Else" });
    const { data: rows } = await admin.from("reservations").select("guest_id").in("id", [first.data![0]!.id, second.data![0]!.id]);
    expect(new Set(rows!.map((r) => r.guest_id)).size).toBe(1);
    const { data: guest } = await admin.from("guests").select("full_name").eq("id", rows![0]!.guest_id).single();
    expect(guest!.full_name).toBe("Real Name");
  });

  it("staff bookings use the direct-booking hold and record who created them", async () => {
    const cat = await makeCategory(1);
    const { data, error } = await staffBooking(desk, cat.id, addDays(today, 150), addDays(today, 151));
    expect(error).toBeNull();
    const { data: row } = await admin.from("reservations").select("created_by, source, hold_expires_at").eq("id", data![0]!.id).single();
    expect(row!.created_by).toBe(desk.id);
    expect(row!.source).toBe("walk_in");
    expect((Date.parse(row!.hold_expires_at!) - Date.now()) / 3_600_000).toBeGreaterThan(23);
    const { data: log } = await admin.from("activity_log").select("actor_id").eq("entity_id", data![0]!.id).eq("action", "reservation.created").single();
    expect(log!.actor_id).toBe(desk.id);
  });

  it("is not callable by website visitors directly", async () => {
    const cat = await makeCategory(1);
    const viaAnon = await anon().rpc("create_website_reservation", {
      p_category_slug: cat.slug, p_check_in: addDays(today, 160), p_check_out: addDays(today, 161), p_guests: 1,
      p_full_name: "X", p_email: "x@example.com", p_phone: "+234",
    });
    expect(viaAnon.error).not.toBeNull();
    const staffFn = await anon().rpc("create_staff_reservation", {
      p_category_id: cat.id, p_check_in: addDays(today, 160), p_check_out: addDays(today, 161), p_guests: 1, p_source: "phone", p_full_name: "X",
    });
    expect(staffFn.error).not.toBeNull();
  });
});

describe("room assignment", () => {
  it("assigns a room, and refuses a second overlapping assignment with a clear message", async () => {
    const cat = await makeCategory(2);
    const r1 = (await staffBooking(desk, cat.id, addDays(today, 170), addDays(today, 173))).data![0]!;
    const r2 = (await staffBooking(desk, cat.id, addDays(today, 171), addDays(today, 172))).data![0]!;
    const room = cat.rooms[0]!;
    expect((await desk.client.rpc("assign_room", { p_reservation_id: r1.id, p_room_id: room.id })).error).toBeNull();
    const clash = await desk.client.rpc("assign_room", { p_reservation_id: r2.id, p_room_id: room.id });
    expect(clash.error?.hint).toBe("CONFLICT");
    expect(clash.error?.message).toContain(room.room_number);
  });

  it("refuses rooms under maintenance", async () => {
    const cat = await makeCategory(2);
    const r = (await staffBooking(desk, cat.id, addDays(today, 180), addDays(today, 181))).data![0]!;
    await desk.client.rpc("update_room_status", { p_room_id: cat.rooms[1]!.id, p_service_status: "maintenance" });
    const { error } = await desk.client.rpc("assign_room", { p_reservation_id: r.id, p_room_id: cat.rooms[1]!.id });
    expect(error?.hint).toBe("UNAVAILABLE");
  });

  it("allows an upgrade only when the better category has capacity", async () => {
    const small = await makeCategory(1);
    const big = await makeCategory(1);
    const [a, b] = [addDays(today, 190), addDays(today, 191)];
    const guest = (await staffBooking(desk, small.id, a, b)).data![0]!;
    expect((await desk.client.rpc("assign_room", { p_reservation_id: guest.id, p_room_id: big.rooms[0]!.id })).error).toBeNull();
    // The upgrade consumed the big category's only unit and released the small one.
    expect(await available(big.slug, a, b)).toBe(false);
    expect(await available(small.slug, a, b)).toBe(true);
    // Now fill the small category; moving the guest back must be refused.
    await staffBooking(desk, small.id, a, b);
    const back = await desk.client.rpc("assign_room", { p_reservation_id: guest.id, p_room_id: small.rooms[0]!.id });
    expect(back.error?.hint).toBe("UNAVAILABLE");
  });
});

describe("front desk lifecycle", () => {
  it("checks a confirmed, assigned guest into a ready room, then out", async () => {
    const cat = await makeCategory(1);
    const r = (await staffBooking(desk, cat.id, today, addDays(today, 2))).data![0]!;
    const room = cat.rooms[0]!;
    await desk.client.rpc("assign_room", { p_reservation_id: r.id, p_room_id: room.id });

    const early = await desk.client.rpc("check_in_reservation", { p_reservation_id: r.id });
    expect(early.error?.message).toMatch(/awaiting payment/);

    await confirm(r.id);
    await desk.client.rpc("update_room_status", { p_room_id: room.id, p_readiness: "needs_cleaning" });
    expect((await desk.client.rpc("check_in_reservation", { p_reservation_id: r.id })).error?.message).toMatch(/not marked ready/);
    await desk.client.rpc("update_room_status", { p_room_id: room.id, p_readiness: "ready" });
    expect((await desk.client.rpc("check_in_reservation", { p_reservation_id: r.id })).error).toBeNull();

    const maint = await desk.client.rpc("update_room_status", { p_room_id: room.id, p_service_status: "maintenance" });
    expect(maint.error?.hint).toBe("CONFLICT");

    const out = await desk.client.rpc("check_out_reservation", { p_reservation_id: r.id });
    expect(out.error).toBeNull();
    expect(out.data).toBeGreaterThan(0); // nothing paid yet → balance reported
    const { data: roomAfter } = await admin.from("rooms").select("readiness").eq("id", room.id).single();
    expect(roomAfter!.readiness).toBe("needs_cleaning");
    const { data: actions } = await admin.from("activity_log").select("action").eq("entity_id", r.id).order("id");
    expect(actions!.map((x) => x.action)).toEqual(["reservation.created", "reservation.room_assigned", "reservation.checked_in", "reservation.checked_out"]);
  });

  it("will not check in before the arrival date or without a room", async () => {
    const cat = await makeCategory(1);
    const future = (await staffBooking(desk, cat.id, addDays(today, 3), addDays(today, 4))).data![0]!;
    await confirm(future.id);
    await desk.client.rpc("assign_room", { p_reservation_id: future.id, p_room_id: cat.rooms[0]!.id });
    expect((await desk.client.rpc("check_in_reservation", { p_reservation_id: future.id })).error?.message).toMatch(/Arrival is not until/);

    const cat2 = await makeCategory(1);
    const noRoom = (await staffBooking(desk, cat2.id, today, addDays(today, 1))).data![0]!;
    await confirm(noRoom.id);
    expect((await desk.client.rpc("check_in_reservation", { p_reservation_id: noRoom.id })).error?.message).toMatch(/Assign a room/);
  });

  it("requires a reason to cancel, and only cancels upcoming stays", async () => {
    const cat = await makeCategory(1);
    const r = (await staffBooking(desk, cat.id, addDays(today, 200), addDays(today, 201))).data![0]!;
    expect((await desk.client.rpc("cancel_reservation", { p_reservation_id: r.id, p_reason: "" })).error?.hint).toBe("VALIDATION");
    expect((await desk.client.rpc("cancel_reservation", { p_reservation_id: r.id, p_reason: "Duplicate booking" })).error).toBeNull();
    expect((await desk.client.rpc("cancel_reservation", { p_reservation_id: r.id, p_reason: "Again" })).error?.hint).toBe("INVALID_TRANSITION");
    const { data: h } = await admin.from("reservation_status_history").select("reason, changed_by").eq("reservation_id", r.id).eq("to_status", "cancelled").single();
    expect(h).toEqual({ reason: "Duplicate booking", changed_by: desk.id });
  });

  it("marks no-shows only once the arrival date has come", async () => {
    const cat = await makeCategory(1);
    const r = (await staffBooking(desk, cat.id, addDays(today, 5), addDays(today, 6))).data![0]!;
    await confirm(r.id);
    expect((await desk.client.rpc("mark_no_show", { p_reservation_id: r.id })).error?.hint).toBe("VALIDATION");
  });
});

describe("payment override (managers only, reason required, audited)", () => {
  it("front desk cannot override", async () => {
    const cat = await makeCategory(1);
    const r = (await staffBooking(desk, cat.id, addDays(today, 210), addDays(today, 211))).data![0]!;
    const { error } = await desk.client.rpc("override_payment_requirement", { p_reservation_id: r.id, p_action: "confirm", p_reason: "Trust me" });
    expect(error?.message).toMatch(/role does not permit/);
  });

  it("GM confirms with a reason, recorded in history and the activity log", async () => {
    const cat = await makeCategory(1);
    const r = (await staffBooking(desk, cat.id, addDays(today, 220), addDays(today, 221))).data![0]!;
    expect((await gm.client.rpc("override_payment_requirement", { p_reservation_id: r.id, p_action: "confirm", p_reason: "no" })).error?.hint).toBe("VALIDATION");
    expect((await gm.client.rpc("override_payment_requirement", { p_reservation_id: r.id, p_action: "confirm", p_reason: "Corporate account, invoiced" })).error).toBeNull();
    const { data: row } = await admin.from("reservations").select("status").eq("id", r.id).single();
    expect(row!.status).toBe("confirmed");
    const { data: log } = await admin.from("activity_log").select("actor_id, metadata").eq("entity_id", r.id).eq("action", "reservation.payment_override").single();
    expect(log!.actor_id).toBe(gm.id);
    expect((log!.metadata as { reason: string }).reason).toBe("Corporate account, invoiced");
  });

  it("re-checks availability if the hold had already lapsed", async () => {
    const cat = await makeCategory(1);
    const [a, b] = [addDays(today, 230), addDays(today, 231)];
    const lapsed = (await staffBooking(desk, cat.id, a, b)).data![0]!;
    await admin.from("reservations").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", lapsed.id);
    await website(cat.slug, a, b); // someone else takes the room
    const { error } = await gm.client.rpc("override_payment_requirement", { p_reservation_id: lapsed.id, p_action: "confirm", p_reason: "Guest paying on arrival" });
    expect(error?.hint).toBe("UNAVAILABLE");
  });
});

describe("expiry job", () => {
  it("expires only lapsed holds and logs each one", async () => {
    const cat = await makeCategory(2);
    const lapsed = (await website(cat.slug, addDays(today, 240), addDays(today, 241))).data![0]!;
    const live = (await website(cat.slug, addDays(today, 240), addDays(today, 241))).data![0]!;
    await admin.from("reservations").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", lapsed.id);
    const { error } = await admin.rpc("expire_unpaid_reservations");
    expect(error).toBeNull();
    const { data } = await admin.from("reservations").select("id, status").in("id", [lapsed.id, live.id]);
    expect(Object.fromEntries(data!.map((r) => [r.id, r.status]))).toEqual({ [lapsed.id]: "expired", [live.id]: "pending_payment" });
    const { count } = await admin.from("activity_log").select("id", { count: "exact", head: true }).eq("entity_id", lapsed.id).eq("action", "reservation.expired");
    expect(count).toBe(1);
  });

  it("cannot be triggered by staff or visitors", async () => {
    expect((await desk.client.rpc("expire_unpaid_reservations")).error).not.toBeNull();
    expect((await anon().rpc("expire_unpaid_reservations")).error).not.toBeNull();
  });
});

describe("website abuse limits", () => {
  it("allows at most three unpaid website holds per email", async () => {
    const cat = await makeCategory(5);
    const email = `hoarder-${randomUUID().slice(0, 6)}@example.com`;
    for (let i = 0; i < 3; i++) expect((await website(cat.slug, addDays(today, 250 + i), addDays(today, 251 + i), { email })).error).toBeNull();
    const fourth = await website(cat.slug, addDays(today, 260), addDays(today, 261), { email });
    expect(fourth.error?.hint).toBe("CONFLICT");
  });
});
