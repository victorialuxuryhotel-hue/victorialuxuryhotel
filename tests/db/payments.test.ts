import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, makeUser, type TestUser } from "./api-helpers";

/** Payment rules, through the real API as the server (service role) and staff. */

let desk: TestUser, gm: TestUser;
let today: string;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let offset = 300;

async function category(rooms = 1, rate = 2_000_000) {
  const tag = randomUUID().slice(0, 8);
  const { data: cat } = await admin.from("room_categories").insert({ slug: `p-${tag}`, name: `Pay ${tag}`, nightly_rate_kobo: rate, max_occupancy: 2 }).select("id, slug").single();
  await admin.from("rooms").insert(Array.from({ length: rooms }, (_, i) => ({ room_number: `P${tag.slice(0, 5)}${i}`, category_id: cat!.id })));
  return cat!;
}

/** A held website booking for 2 nights, plus a started Paystack attempt. */
async function heldBooking(rate = 2_000_000) {
  const cat = await category(1, rate);
  const [ci, co] = [addDays(today, offset), addDays(today, offset + 2)];
  offset += 3;
  const { data, error } = await admin.rpc("create_website_reservation", {
    p_category_slug: cat.slug, p_check_in: ci, p_check_out: co, p_guests: 1,
    p_full_name: "Pay Guest", p_email: `pay-${randomUUID().slice(0, 8)}@example.com`, p_phone: "+2348000000003",
  });
  if (error) throw error;
  const res = data[0]!;
  const { data: attempt, error: e2 } = await admin.rpc("begin_paystack_payment", { p_public_token: res.public_token });
  if (e2) throw e2;
  return { cat, res, attempt: attempt[0]!, checkIn: ci, checkOut: co };
}

const apply = (reference: string, status: string, amount: number, currency = "NGN") =>
  admin.rpc("apply_paystack_result", {
    p_reference: reference, p_status: status, p_amount_kobo: amount, p_currency: currency,
    p_paid_at: new Date().toISOString(), p_channel: "card", p_gateway_response: status === "success" ? "Approved" : "Declined",
  });

const reservation = async (id: string) =>
  (await admin.from("reservations").select("status, attention_reason").eq("id", id).single()).data!;
const payment = async (ref: string) =>
  (await admin.from("payments").select("status, receipt_number, method, verified_at").eq("provider_reference", ref).single()).data!;

beforeAll(async () => {
  [desk, gm] = await Promise.all([makeUser("front_desk"), makeUser("general_manager")]);
  today = (await admin.rpc("hotel_today")).data as unknown as string;
});

describe("Paystack payments", () => {
  it("starting a payment charges the server-calculated balance", async () => {
    const { attempt, res } = await heldBooking(2_500_000);
    expect(attempt.amount_kobo).toBe(5_000_000);
    expect(attempt.amount_kobo).toBe(res.total_amount_kobo);
    expect(attempt.reference).toMatch(new RegExp(`^${res.reference.toLowerCase()}-[0-9a-f]{8}$`));
  });

  it("a verified success confirms the reservation and issues a receipt", async () => {
    const { attempt, res } = await heldBooking();
    const { data } = await apply(attempt.reference, "success", attempt.amount_kobo);
    expect(data).toBe("confirmed");
    expect((await reservation(res.id)).status).toBe("confirmed");
    const p = await payment(attempt.reference);
    expect(p.status).toBe("successful");
    expect(p.method).toBe("card");
    expect(p.receipt_number).toMatch(/^RCT-\d{4}-\d{6}$/);
  });

  it("duplicate notifications are no-ops", async () => {
    const { attempt } = await heldBooking();
    expect((await apply(attempt.reference, "success", attempt.amount_kobo)).data).toBe("confirmed");
    expect((await apply(attempt.reference, "success", attempt.amount_kobo)).data).toBe("already_processed");
    expect((await apply(attempt.reference, "failed", attempt.amount_kobo)).data).toBe("already_processed");
    expect((await payment(attempt.reference)).status).toBe("successful");
  });

  it("callback and webhook arriving together confirm exactly once", async () => {
    const { attempt, res } = await heldBooking();
    const results = await Promise.all(Array.from({ length: 5 }, () => apply(attempt.reference, "success", attempt.amount_kobo)));
    expect(results.map((r) => r.data).sort()).toEqual(["already_processed", "already_processed", "already_processed", "already_processed", "confirmed"]);
    const { count } = await admin.from("activity_log").select("id", { count: "exact", head: true }).eq("entity_id", res.id).eq("action", "payment.verified");
    expect(count).toBe(1);
  });

  it.each([
    ["a lower amount", 1, "NGN"],
    ["a different currency", 0, "USD"],
  ])("flags %s instead of confirming", async (_, delta, currency) => {
    const { attempt, res } = await heldBooking();
    const { data } = await apply(attempt.reference, "success", attempt.amount_kobo - delta, currency);
    expect(data).toBe("amount_mismatch");
    const r = await reservation(res.id);
    expect(r.status).toBe("pending_payment");
    expect(r.attention_reason).toMatch(/does not match/);
    expect((await payment(attempt.reference)).status).toBe("pending");
  });

  it("records failed and abandoned attempts without touching the reservation", async () => {
    const a = await heldBooking();
    expect((await apply(a.attempt.reference, "failed", a.attempt.amount_kobo)).data).toBe("failed");
    expect((await payment(a.attempt.reference)).status).toBe("failed");
    expect((await reservation(a.res.id)).status).toBe("pending_payment");

    const b = await heldBooking();
    expect((await apply(b.attempt.reference, "abandoned", b.attempt.amount_kobo)).data).toBe("abandoned");
    expect((await payment(b.attempt.reference)).status).toBe("abandoned");
  });

  it("a guest can retry after a failure with a fresh reference", async () => {
    const { attempt, res } = await heldBooking();
    await apply(attempt.reference, "failed", attempt.amount_kobo);
    const { data: retry } = await admin.rpc("begin_paystack_payment", { p_public_token: res.public_token });
    expect(retry![0]!.reference).not.toBe(attempt.reference);
    expect((await apply(retry![0]!.reference, "success", retry![0]!.amount_kobo)).data).toBe("confirmed");
  });

  it("ignores still-pending results", async () => {
    const { attempt } = await heldBooking();
    expect((await apply(attempt.reference, "ongoing", attempt.amount_kobo)).data).toBe("still_pending");
  });

  it("rejects an unknown reference", async () => {
    const { error } = await apply(`nope-${randomUUID()}`, "success", 100);
    expect(error?.hint).toBe("NOT_FOUND");
  });

  it("a delayed payment after the hold lapsed still confirms if the room is free", async () => {
    const { attempt, res } = await heldBooking();
    await admin.from("reservations").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", res.id);
    await admin.rpc("expire_unpaid_reservations");
    expect((await reservation(res.id)).status).toBe("expired");
    expect((await apply(attempt.reference, "success", attempt.amount_kobo)).data).toBe("confirmed");
    expect((await reservation(res.id)).status).toBe("confirmed");
  });

  it("a delayed payment for a room that has since sold flags the booking for a refund", async () => {
    const { attempt, res, cat, checkIn, checkOut } = await heldBooking();
    await admin.from("reservations").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", res.id);
    await admin.rpc("create_website_reservation", {
      p_category_slug: cat.slug, p_check_in: checkIn, p_check_out: checkOut, p_guests: 1,
      p_full_name: "Someone Else", p_email: `other-${randomUUID().slice(0, 6)}@example.com`, p_phone: "+2348000000004",
    });
    expect((await apply(attempt.reference, "success", attempt.amount_kobo)).data).toBe("paid_unavailable");
    const r = await reservation(res.id);
    expect(r.status).toBe("expired");
    expect(r.attention_reason).toMatch(/refund/);
    expect((await payment(attempt.reference)).status).toBe("successful"); // the money is recorded either way
  });

  it("can't start a payment once the hold has ended or it's paid", async () => {
    const { res, attempt } = await heldBooking();
    await apply(attempt.reference, "success", attempt.amount_kobo);
    expect((await admin.rpc("begin_paystack_payment", { p_public_token: res.public_token })).error?.hint).toBe("INVALID_TRANSITION");
  });

  it("is only callable by the server", async () => {
    const { attempt } = await heldBooking();
    expect((await anon().rpc("apply_paystack_result", { p_reference: attempt.reference, p_status: "success", p_amount_kobo: attempt.amount_kobo, p_currency: "NGN", p_paid_at: new Date().toISOString(), p_channel: "card", p_gateway_response: "x" })).error).not.toBeNull();
    expect((await desk.client.rpc("apply_paystack_result", { p_reference: attempt.reference, p_status: "success", p_amount_kobo: attempt.amount_kobo, p_currency: "NGN", p_paid_at: new Date().toISOString(), p_channel: "card", p_gateway_response: "x" })).error).not.toBeNull();
    expect((await payment(attempt.reference)).status).toBe("pending");
  });
});

describe("offline payments", () => {
  async function staffBooking(rate = 1_500_000) {
    const cat = await category(1, rate);
    const [ci, co] = [addDays(today, offset), addDays(today, offset + 2)];
    offset += 3;
    const { data } = await desk.client.rpc("create_staff_reservation", {
      p_category_id: cat.id, p_check_in: ci, p_check_out: co, p_guests: 1, p_source: "phone", p_full_name: "Phone Guest", p_phone: "+2348000000005",
    });
    return data![0]!;
  }
  const record = (who: TestUser, id: string, amount: number, confirm = true, extra: Partial<{ ref: string; date: string; method: "cash" | "bank_transfer" | "card" }> = {}) =>
    who.client.rpc("record_offline_payment", {
      p_reservation_id: id, p_amount_kobo: amount, p_method: extra.method ?? "bank_transfer", p_reference: extra.ref ?? "",
      p_paid_on: extra.date ?? today, p_notes: "", p_confirm_received: confirm,
    });

  it("requires staff to confirm the money was received", async () => {
    const r = await staffBooking();
    expect((await record(desk, r.id, 3_000_000, false)).error?.hint).toBe("VALIDATION");
  });

  it("a part payment is recorded but doesn't confirm; the balance does", async () => {
    const r = await staffBooking();
    const part = await record(desk, r.id, 1_000_000, true, { method: "cash" });
    expect(part.data![0]!.outcome).toBe("part_paid");
    expect(part.data![0]!.receipt_number).toMatch(/^RCT-/);
    expect((await reservation(r.id)).status).toBe("pending_payment");
    const rest = await record(desk, r.id, 2_000_000, true, { ref: `TRF-${randomUUID().slice(0, 6)}` });
    expect(rest.data![0]!.outcome).toBe("confirmed");
    expect((await reservation(r.id)).status).toBe("confirmed");
  });

  it("refuses overpayment, future dates, card as an 'offline' method, and duplicate references", async () => {
    const r = await staffBooking();
    expect((await record(desk, r.id, 3_000_001)).error?.message).toMatch(/more than/);
    expect((await record(desk, r.id, 100, true, { date: addDays(today, 1) })).error?.hint).toBe("VALIDATION");
    expect((await record(desk, r.id, 100, true, { method: "card" })).error?.hint).toBe("VALIDATION");
    const ref = `DUP-${randomUUID().slice(0, 6)}`;
    expect((await record(desk, r.id, 100, true, { ref })).error).toBeNull();
    expect((await record(desk, r.id, 100, true, { ref })).error?.hint).toBe("CONFLICT");
  });

  it("records who took the money, and audits it", async () => {
    const r = await staffBooking();
    const { data } = await record(desk, r.id, 3_000_000);
    const { data: p } = await admin.from("payments").select("recorded_by, provider, verified_at").eq("id", data![0]!.payment_id).single();
    expect(p).toMatchObject({ recorded_by: desk.id, provider: "offline" });
    expect(p!.verified_at).not.toBeNull();
    const { count } = await admin.from("activity_log").select("id", { count: "exact", head: true }).eq("entity_id", r.id).eq("action", "payment.recorded").eq("actor_id", desk.id);
    expect(count).toBe(1);
  });

  it("refuses payments on cancelled reservations", async () => {
    const r = await staffBooking();
    await desk.client.rpc("cancel_reservation", { p_reservation_id: r.id, p_reason: "Changed plans" });
    expect((await record(desk, r.id, 100)).error?.hint).toBe("INVALID_TRANSITION");
  });
});

describe("other booking workflows", () => {
  it("changes dates with re-pricing at the agreed rate, and flags overpayment", async () => {
    const cat = await category(1, 1_000_000);
    const [ci, co] = [addDays(today, offset), addDays(today, offset + 3)];
    offset += 6;
    const { data } = await desk.client.rpc("create_staff_reservation", { p_category_id: cat.id, p_check_in: ci, p_check_out: co, p_guests: 1, p_source: "phone", p_full_name: "Date Guest" });
    const id = data![0]!.id;
    await desk.client.rpc("record_offline_payment", { p_reservation_id: id, p_amount_kobo: 3_000_000, p_method: "cash", p_reference: "", p_paid_on: today, p_notes: "", p_confirm_received: true });
    expect((await desk.client.rpc("change_reservation_dates", { p_reservation_id: id, p_check_in: ci, p_check_out: addDays(ci, 1) })).error).toBeNull();
    const { data: r } = await admin.from("reservations").select("total_amount_kobo, attention_reason").eq("id", id).single();
    expect(r!.total_amount_kobo).toBe(1_000_000);
    expect(r!.attention_reason).toMatch(/refund/);
  });

  it("only managers resolve attention flags, with a note", async () => {
    const { attempt, res } = await heldBooking();
    await apply(attempt.reference, "success", attempt.amount_kobo - 1);
    expect((await desk.client.rpc("resolve_attention", { p_reservation_id: res.id, p_note: "Checked dashboard" })).error).not.toBeNull();
    expect((await gm.client.rpc("resolve_attention", { p_reservation_id: res.id, p_note: "ok" })).error?.hint).toBe("VALIDATION");
    expect((await gm.client.rpc("resolve_attention", { p_reservation_id: res.id, p_note: "Checked Paystack dashboard: test transaction" })).error).toBeNull();
    expect((await reservation(res.id)).attention_reason).toBeNull();
  });
});
