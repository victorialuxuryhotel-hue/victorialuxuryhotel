import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, makeUser, type TestUser } from "./api-helpers";
import { connect, insertReservation, type Sql } from "./helpers";

/** Fixes from the engineering review: overpayment, email outbox, receipts, rate limiting. */

let desk: TestUser, gm: TestUser;
let today: string;
let sql: Sql;
let offset = 600;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  [desk, gm] = await Promise.all([makeUser("front_desk"), makeUser("general_manager")]);
  today = (await admin.rpc("hotel_today")).data as unknown as string;
  sql = connect();
});
afterAll(async () => {
  await sql.end();
});

async function heldWebsiteBooking() {
  const tag = randomUUID().slice(0, 8);
  const { data: cat } = await admin.from("room_categories").insert({ slug: `r-${tag}`, name: `Review ${tag}`, nightly_rate_kobo: 1_000_000, max_occupancy: 2 }).select("id, slug").single();
  await admin.from("rooms").insert({ room_number: `R${tag.slice(0, 6)}`, category_id: cat!.id });
  const [ci, co] = [addDays(today, offset), addDays(today, offset + 2)];
  offset += 3;
  const { data } = await admin.rpc("create_website_reservation", {
    p_category_slug: cat!.slug, p_check_in: ci, p_check_out: co, p_guests: 1,
    p_full_name: "Review Guest", p_email: `review-${tag}@example.com`, p_phone: "+2348000000010",
  });
  return data![0]!;
}
const apply = (reference: string, amount: number) =>
  admin.rpc("apply_paystack_result", {
    p_reference: reference, p_status: "success", p_amount_kobo: amount, p_currency: "NGN",
    p_paid_at: new Date().toISOString(), p_channel: "card", p_gateway_response: "Approved",
  });
const outbox = async (reservationId: string) =>
  (await admin.from("email_outbox").select("kind, status").eq("reservation_id", reservationId).order("created_at")).data!;

describe("overpayment across payment channels", () => {
  it("guest pays online while staff record cash: both recorded, booking flagged for a refund", async () => {
    const res = await heldWebsiteBooking();
    const { data: attempt } = await admin.rpc("begin_paystack_payment", { p_public_token: res.public_token });
    // Staff take the full amount in cash while the guest is on the Paystack page.
    const cash = await desk.client.rpc("record_offline_payment", {
      p_reservation_id: res.id, p_amount_kobo: res.total_amount_kobo, p_method: "cash", p_reference: "", p_paid_on: today, p_notes: "", p_confirm_received: true,
    });
    expect(cash.data![0]!.outcome).toBe("confirmed");
    const { data: outcome } = await apply(attempt![0]!.reference, attempt![0]!.amount_kobo);
    expect(outcome).toBe("overpaid");
    const { data: r } = await admin.from("reservations").select("status, attention_reason").eq("id", res.id).single();
    expect(r!.status).toBe("confirmed");
    expect(r!.attention_reason).toMatch(/Overpaid by ₦20,000/);
    const { count } = await admin.from("activity_log").select("id", { count: "exact", head: true }).eq("entity_id", res.id).eq("action", "payment.overpaid");
    expect(count).toBe(1);
  });
});

describe("email outbox", () => {
  it("queues exactly one confirmation, even when five confirmations race", async () => {
    const res = await heldWebsiteBooking();
    const { data: attempt } = await admin.rpc("begin_paystack_payment", { p_public_token: res.public_token });
    await Promise.all(Array.from({ length: 5 }, () => apply(attempt![0]!.reference, attempt![0]!.amount_kobo)));
    expect(await outbox(res.id)).toEqual([{ kind: "booking_confirmed", status: "pending" }]);
  });

  it("queues receipts for offline payments, confirmations for overrides, and cancellations", async () => {
    const a = await heldWebsiteBooking();
    await desk.client.rpc("record_offline_payment", { p_reservation_id: a.id, p_amount_kobo: 500_000, p_method: "cash", p_reference: "", p_paid_on: today, p_notes: "", p_confirm_received: true });
    expect((await outbox(a.id)).map((o) => o.kind)).toEqual(["payment_received"]);

    const b = await heldWebsiteBooking();
    await gm.client.rpc("override_payment_requirement", { p_reservation_id: b.id, p_action: "confirm", p_reason: "Corporate account" });
    await desk.client.rpc("cancel_reservation", { p_reservation_id: b.id, p_reason: "Guest cancelled" });
    expect((await outbox(b.id)).map((o) => o.kind)).toEqual(["booking_confirmed", "reservation_cancelled"]);
  });

  it("is written in the same transaction: a rolled-back confirmation queues nothing", async () => {
    const r = await insertReservation(sql, { status: "pending_payment", checkIn: addDays(today, 700), checkOut: addDays(today, 701) });
    await sql.begin(async (tx) => {
      await tx`update reservations set status = 'confirmed' where id = ${r.id}`;
      await tx`select 1/0`; // fail after the change
    }).catch(() => {});
    expect(await outbox(r.id)).toEqual([]);
  });

  it("two senders never claim the same email", async () => {
    const res = await heldWebsiteBooking();
    await gm.client.rpc("override_payment_requirement", { p_reservation_id: res.id, p_action: "confirm", p_reason: "Concurrency test" });
    const [x, y] = await Promise.all([admin.rpc("claim_outbox", { p_limit: 500 }), admin.rpc("claim_outbox", { p_limit: 500 })]);
    const ids = [...(x.data ?? []), ...(y.data ?? [])].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) await admin.rpc("finish_outbox", { p_id: id, p_status: "sent" });
  });

  it("retries with back-off and gives up after five attempts", async () => {
    const res = await heldWebsiteBooking();
    await gm.client.rpc("override_payment_requirement", { p_reservation_id: res.id, p_action: "confirm", p_reason: "Retry test" });
    const { data: row } = await admin.from("email_outbox").select("id").eq("reservation_id", res.id).single();
    for (let i = 0; i < 5; i++) {
      await admin.from("email_outbox").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", row!.id);
      const { data: claimed } = await admin.rpc("claim_outbox", { p_limit: 500, p_only: [row!.id] });
      expect(claimed).toHaveLength(1);
      await admin.rpc("finish_outbox", { p_id: row!.id, p_status: "retry", p_error: "Resend unavailable" });
    }
    const { data: after } = await admin.from("email_outbox").select("status, attempts, last_error").eq("id", row!.id).single();
    expect(after).toEqual({ status: "failed", attempts: 5, last_error: "Resend unavailable" });
  });

  it("is not reachable by staff or visitors", async () => {
    expect((await desk.client.rpc("claim_outbox", { p_limit: 1 })).error).not.toBeNull();
    expect((await anon().from("email_outbox").select("id").limit(1)).data ?? []).toEqual([]);
  });
});

describe("receipt numbers", () => {
  it("stay gapless when a payment transaction rolls back", async () => {
    const r = await insertReservation(sql, { checkIn: addDays(today, 710), checkOut: addDays(today, 711) });
    const insert = (tx: Sql | TransactionSql, ref: string) =>
      tx`insert into payments (reservation_id, amount_kobo, provider, provider_reference, status, paid_at, verified_at)
         values (${r.id}, 100, 'paystack', ${ref}, 'successful', now(), now()) returning receipt_number`;
    const [first] = await insert(sql, `g1-${r.id}`);
    await sql.begin(async (tx) => {
      await insert(tx, `g2-${r.id}`);
      await tx`select 1/0`;
    }).catch(() => {});
    const [third] = await insert(sql, `g3-${r.id}`);
    const n = (s: string) => Number(s.split("-")[2]);
    expect(n(third!.receipt_number)).toBe(n(first!.receipt_number) + 1);
  });

  it("stay unique under concurrent payments", async () => {
    const r = await insertReservation(sql, { checkIn: addDays(today, 712), checkOut: addDays(today, 713) });
    const rows = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      sql`insert into payments (reservation_id, amount_kobo, provider, provider_reference, status, paid_at, verified_at)
          values (${r.id}, 100, 'paystack', ${`c${i}-${r.id}`}, 'successful', now(), now()) returning receipt_number`));
    const numbers = rows.map((x) => Number(x[0]!.receipt_number.split("-")[2])).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(10);
    expect(numbers[9]! - numbers[0]!).toBe(9); // contiguous
  });
});

describe("rate limiting", () => {
  it("allows the limit, then refuses until the window passes", async () => {
    const key = `test:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await admin.rpc("hit_rate_limit", { p_key: key, p_limit: 3, p_window_seconds: 3600 })).data);
    expect(results).toEqual([true, true, true, false]);
  });

  it("can't be called (or reset) by visitors or staff", async () => {
    expect((await anon().rpc("hit_rate_limit", { p_key: "x", p_limit: 1, p_window_seconds: 60 })).error).not.toBeNull();
    expect((await desk.client.rpc("hit_rate_limit", { p_key: "x", p_limit: 1, p_window_seconds: 60 })).error).not.toBeNull();
  });
});
