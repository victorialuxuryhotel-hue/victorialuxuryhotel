import { describe, expect, it } from "vitest";
import { applyPaystackResult, beginPaystackPayment, recordOfflinePayment, recordPaymentCorrection } from "@/server/domain/payments";
import { cancelReservation, changeReservationDates, createWebsiteReservation, netPaid, overridePaymentRequirement, resolveAttention } from "@/server/domain/reservations";
import { AppError } from "@/lib/errors";
import { claimOutbox, finishOutbox, hitRateLimit } from "@/server/domain/system";
import { day, db, desk, exec, gm, insertReservation, iso, lapseHold, makeCategory, q, q1, rejects, status } from "./helpers";

async function heldBooking(rooms = 1, rateKobo = 5_000_000) {
  const c = await makeCategory(rooms, { rateKobo });
  const r = await createWebsiteReservation(db, {
    categorySlug: c.slug, checkIn: day(30), checkOut: day(32), guests: 1, fullName: "Pay Guest",
    email: `pay-${crypto.randomUUID().slice(0, 8)}@example.com`, phone: "+2348000000002",
  });
  return { ...r, category: c };
}

const success = (reference: string, amountKobo: number, extra: Partial<Parameters<typeof applyPaystackResult>[1]> = {}) =>
  applyPaystackResult(db, { reference, status: "success", amountKobo, currency: "NGN", paidAt: iso(0), channel: "card", gatewayResponse: "Approved", ...extra });

const offline = (reservationId: string, amountKobo: number, extra: Partial<Parameters<typeof recordOfflinePayment>[2]> = {}) =>
  recordOfflinePayment(db, desk, { reservationId, amountKobo, method: "bank_transfer", reference: `GTB ${crypto.randomUUID().slice(0, 8)}`, paidOn: day(0), confirmReceived: true, ...extra });

describe("Paystack payments", () => {
  it("starting a payment charges the server-calculated balance", async () => {
    const b = await heldBooking(1, 5_000_000);
    const p = await beginPaystackPayment(db, b.publicToken);
    expect(p.amountKobo).toBe(10_000_000);
    expect(p.reference).toMatch(new RegExp(`^${b.reference.toLowerCase()}-[0-9a-f]{8}$`));
  });

  it("a verified success confirms the reservation and issues a receipt", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    expect(await success(p.reference, p.amountKobo)).toBe("confirmed");
    expect(await status(b.id)).toBe("confirmed");
    const pay = await q1<{ status: string; receipt_number: string; method: string }>("SELECT status, receipt_number, method FROM payments WHERE provider_reference = ?", p.reference);
    expect(pay).toMatchObject({ status: "successful", method: "card" });
    expect(pay.receipt_number).toMatch(/^RCT-\d{4}-\d{6}$/);
  });

  it("confirming gives the guest a free room of their type, logged; taken rooms are skipped", async () => {
    const b = await heldBooking(2);
    await insertReservation({ categoryId: b.category.id, checkIn: day(31), checkOut: day(33), roomId: b.category.roomIds[0], status: "confirmed" });
    const p = await beginPaystackPayment(db, b.publicToken);
    expect(await success(p.reference, p.amountKobo)).toBe("confirmed");
    const r = await q1<{ room_id: string | null }>("SELECT room_id FROM reservations WHERE id = ?", b.id);
    expect(r.room_id).toBe(b.category.roomIds[1]);
    const log = await q<{ action: string; actor_type: string }>("SELECT action, actor_type FROM activity_log WHERE entity_id = ? AND action = 'reservation.room_auto_assigned'", b.id);
    expect(log).toEqual([{ action: "reservation.room_auto_assigned", actor_type: "system" }]);
  });

  it("an unpaid booking can't be given a room before payment (I4); payment assigns one", async () => {
    const b = await heldBooking(2);
    await rejects(exec("UPDATE reservations SET room_id = ? WHERE id = ?", b.category.roomIds[1], b.id), /room_before_payment/);
    const p = await beginPaystackPayment(db, b.publicToken);
    await success(p.reference, p.amountKobo);
    expect((await q1<{ room_id: string | null }>("SELECT room_id FROM reservations WHERE id = ?", b.id)).room_id).not.toBeNull();
  });

  it("duplicate notifications are no-ops", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    await success(p.reference, p.amountKobo);
    expect(await success(p.reference, p.amountKobo)).toBe("already_processed");
    expect(await applyPaystackResult(db, { reference: p.reference, status: "failed", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: "x" })).toBe("already_processed");
  });

  it("callback, webhook and sweep arriving together confirm exactly once, with one email", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => success(p.reference, p.amountKobo)));
    expect(outcomes.filter((o) => o === "confirmed")).toHaveLength(1);
    expect(outcomes.filter((o) => o !== "confirmed").every((o) => o === "already_processed")).toBe(true);
    expect(await q("SELECT 1 FROM email_outbox WHERE reservation_id = ? AND kind = 'booking_confirmed'", b.id)).toHaveLength(1);
    expect(await q("SELECT 1 FROM payments WHERE reservation_id = ? AND status = 'successful'", b.id)).toHaveLength(1);
  });

  it("records failed and abandoned attempts without touching the reservation", async () => {
    const b = await heldBooking();
    const p1 = await beginPaystackPayment(db, b.publicToken);
    expect(await applyPaystackResult(db, { reference: p1.reference, status: "failed", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: "Declined" })).toBe("failed");
    const p2 = await beginPaystackPayment(db, b.publicToken);
    expect(await applyPaystackResult(db, { reference: p2.reference, status: "abandoned", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: null })).toBe("abandoned");
    expect(await status(b.id)).toBe("pending_payment");
  });

  it("a guest can retry after a failure with a fresh reference", async () => {
    const b = await heldBooking();
    const p1 = await beginPaystackPayment(db, b.publicToken);
    await applyPaystackResult(db, { reference: p1.reference, status: "failed", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: "Declined" });
    const p2 = await beginPaystackPayment(db, b.publicToken);
    expect(p2.reference).not.toBe(p1.reference);
    expect(await success(p2.reference, p2.amountKobo)).toBe("confirmed");
  });

  it("ignores still-pending results, and rejects an unknown reference", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    expect(await applyPaystackResult(db, { reference: p.reference, status: "ongoing", amountKobo: 0, currency: "NGN", paidAt: null, channel: null, gatewayResponse: null })).toBe("still_pending");
    await rejects(success("vl-nope00-00000000", 1), /couldn't find that payment/, "NOT_FOUND");
  });

  it("a mismatched amount or currency is flagged once and never confirms", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    expect(await success(p.reference, p.amountKobo - 100)).toBe("amount_mismatch");
    expect(await success(p.reference, p.amountKobo, { currency: "USD" })).toBe("already_flagged");
    expect(await status(b.id)).toBe("pending_payment");
    expect((await q1<{ attention_reason: string }>("SELECT attention_reason FROM reservations WHERE id = ?", b.id)).attention_reason).toMatch(/does not match/);
    expect(await q("SELECT 1 FROM activity_log WHERE entity_id = ? AND action = 'payment.mismatch'", b.id)).toHaveLength(1);
  });

  it("a delayed payment after the hold lapsed still confirms if the room is free", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    await lapseHold(b.id);
    expect(await success(p.reference, p.amountKobo)).toBe("confirmed");
  });

  it("a delayed payment for a room that has since sold records the money and flags a refund", async () => {
    const b = await heldBooking(1);
    const p = await beginPaystackPayment(db, b.publicToken);
    await lapseHold(b.id);
    await insertReservation({ categoryId: b.category.id, checkIn: day(30), checkOut: day(32), status: "confirmed" });
    expect(await success(p.reference, p.amountKobo)).toBe("paid_unavailable");
    expect(await status(b.id)).toBe("expired");
    expect((await q1<{ attention_reason: string }>("SELECT attention_reason FROM reservations WHERE id = ?", b.id)).attention_reason).toMatch(/fully booked/);
    expect((await q1<{ status: string }>("SELECT status FROM payments WHERE provider_reference = ?", p.reference)).status).toBe("successful");
  });

  it("can't start a payment once the hold has ended or it's paid", async () => {
    const b = await heldBooking();
    const p = await beginPaystackPayment(db, b.publicToken);
    await success(p.reference, p.amountKobo);
    await rejects(beginPaystackPayment(db, b.publicToken), /already paid and confirmed/);
    const b2 = await heldBooking();
    await lapseHold(b2.id);
    await rejects(beginPaystackPayment(db, b2.publicToken), /hold has ended/);
  });
});

describe("offline payments", () => {
  it("requires staff, and confirmation that the money was received", async () => {
    const b = await heldBooking();
    await rejects(recordOfflinePayment(db, null, { reservationId: b.id, amountKobo: 100, method: "cash", paidOn: day(0), confirmReceived: true }), /session has ended/);
    await rejects(offline(b.id, 100, { confirmReceived: false }), /Confirm that the hotel has received/);
  });

  it("part payments are allowed at the desk: a deposit confirms the booking (no hold left to lapse) and the rest stays owed", async () => {
    const b = await heldBooking(1, 5_000_000);
    const part = await offline(b.id, 4_000_000);
    expect(part.receiptNumber).toMatch(/^RCT-/);
    expect(await status(b.id)).toBe("confirmed");
    expect(await netPaid(db, b.id)).toBe(4_000_000);
    const rest = await offline(b.id, 6_000_000);
    expect(rest.outcome).toBe("already_settled");
    expect(await netPaid(db, b.id)).toBe(10_000_000);
  });

  it("refuses overpayment (cash: record what's owed and give change), future dates and very old dates", async () => {
    const b = await heldBooking(1, 5_000_000);
    await rejects(offline(b.id, 10_000_100), /Only ₦100,000 is owed\. Take no more/);
    await rejects(offline(b.id, 10_000_100, { method: "cash", reference: null }), /Record ₦100,000 and give the change/);
    await rejects(offline(b.id, 100, { paidOn: day(1) }), /can't be in the future/);
    await rejects(offline(b.id, 100, { paidOn: day(-61) }), /older than 60 days/);
  });

  it("warns, without blocking, when the same transfer reference was used in the last 7 days", async () => {
    const ref = `TRF-DUP-${crypto.randomUUID().slice(0, 6)}`;
    const b = await heldBooking(1, 5_000_000);
    await offline(b.id, 10_000_000, { reference: ref });
    const b2 = await heldBooking(1, 5_000_000);
    const err = await offline(b2.id, 10_000_000, { reference: ref }).catch((e: unknown) => e as AppError);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("CONFLICT");
    expect((err as AppError).fieldErrors?.duplicate?.[0]).toMatch(/already recorded .* in the last 7 days/);
    // Said to record it anyway: it is recorded.
    expect((await offline(b2.id, 10_000_000, { reference: ref, duplicateOk: true })).receiptNumber).toMatch(/^RCT-/);
  });

  it("a transfer needs the reference or the sender's name, and the bank-app tick; POS needs exactly 4 slip digits and a terminal", async () => {
    const b = await heldBooking(1, 5_000_000);
    await rejects(offline(b.id, 100, { reference: null, senderName: null }), /reference or the sender's name/);
    await rejects(offline(b.id, 100, { confirmReceived: false }), /Confirm that the hotel has received/);
    expect((await offline(b.id, 100, { reference: null, senderName: "Chidi Okafor" })).receiptNumber).toMatch(/^RCT-/);
    const pos = { method: "pos_terminal" as const, reference: null, terminal: "Front desk terminal" };
    await rejects(offline(b.id, 100, { ...pos, slipLast4: "441" }), /exactly the last 4 digits/);
    await rejects(offline(b.id, 100, { ...pos, slipLast4: "44a7" }), /exactly the last 4 digits/);
    await rejects(offline(b.id, 100, { ...pos, slipLast4: "4417", terminal: "Somebody's phone" }), /Choose the terminal/);
    const r = await offline(b.id, 100, { ...pos, slipLast4: "4417" });
    expect(await q1("SELECT slip_last4, terminal, sender_name FROM payments WHERE id = ?", r.paymentId)).toEqual({ slip_last4: "4417", terminal: "Front desk terminal", sender_name: null });
  });

  it("records who took the money, audits it and queues a receipt email", async () => {
    const b = await heldBooking();
    const { paymentId } = await offline(b.id, 10_000_000);
    expect((await q1<{ recorded_by: string }>("SELECT recorded_by FROM payments WHERE id = ?", paymentId)).recorded_by).toBe(desk!.id);
    const log = await q1<{ actor_id: string; summary: string }>("SELECT actor_id, summary FROM activity_log WHERE entity_id = ? AND action = 'payment.recorded'", b.id);
    expect(log.actor_id).toBe(desk!.id);
    expect(log.summary).toMatch(/Bank transfer payment of/);
    expect(await q("SELECT 1 FROM email_outbox WHERE payment_id = ? AND kind = 'payment_received'", paymentId)).toHaveLength(1);
  });

  it("refuses payments on cancelled reservations", async () => {
    const b = await heldBooking();
    await cancelReservation(db, desk, b.id, "Guest cancelled");
    await rejects(offline(b.id, 100), /cancelled booking/);
  });
});

describe("overpayment across payment channels", () => {
  it("guest pays online while staff record a transfer: both recorded, booking flagged", async () => {
    const b = await heldBooking(1, 5_000_000);
    const p = await beginPaystackPayment(db, b.publicToken); // checkout amount fixed at 10,000,000
    await offline(b.id, 10_000_000); // meanwhile staff record a full transfer
    expect(await success(p.reference, p.amountKobo)).toBe("overpaid");
    const paid = await q1<{ n: number }>("SELECT count(*) AS n FROM payments WHERE reservation_id = ? AND status = 'successful'", b.id);
    expect(paid.n).toBe(2);
    expect((await q1<{ attention_reason: string }>("SELECT attention_reason FROM reservations WHERE id = ?", b.id)).attention_reason).toMatch(/Overpaid by/);
  });

  it("the race the other way round: concurrent Paystack success and transfer never lose money", async () => {
    const b = await heldBooking(1, 5_000_000);
    const p = await beginPaystackPayment(db, b.publicToken);
    const [online, transfer] = await Promise.allSettled([success(p.reference, p.amountKobo), offline(b.id, 10_000_000)]);
    expect(online.status).toBe("fulfilled");
    const rows = await q<{ amount_kobo: number }>("SELECT amount_kobo FROM payments WHERE reservation_id = ? AND status = 'successful'", b.id);
    if (transfer.status === "fulfilled") {
      expect(rows).toHaveLength(2);
      expect((await q1<{ attention_reason: string }>("SELECT attention_reason FROM reservations WHERE id = ?", b.id)).attention_reason).toMatch(/Overpaid/);
    } else {
      expect(rows).toHaveLength(1);
      expect((transfer as PromiseRejectedResult).reason.message).toMatch(/already paid in full/);
    }
    expect(await status(b.id)).toBe("confirmed");
  });
});

describe("other booking workflows", () => {
  it("shortening a paid stay re-prices at the agreed rate and flags the refund", async () => {
    const b = await heldBooking(1, 5_000_000);
    await offline(b.id, 10_000_000);
    await changeReservationDates(db, desk, b.id, day(30), day(31));
    const r = await q1<{ total_amount_kobo: number; attention_reason: string }>("SELECT total_amount_kobo, attention_reason FROM reservations WHERE id = ?", b.id);
    expect(r.total_amount_kobo).toBe(5_000_000);
    expect(r.attention_reason).toMatch(/paid more than the new total/);
  });

  it("only managers resolve attention flags, with a note", async () => {
    const b = await heldBooking();
    await exec("UPDATE reservations SET attention_reason = 'Check this' WHERE id = ?", b.id);
    await rejects(resolveAttention(db, desk, b.id, "Handled it"), /role can't do this/);
    await rejects(resolveAttention(db, gm, b.id, "ok"), /Describe how/);
    await resolveAttention(db, gm, b.id, "Refunded via Paystack dashboard");
    expect((await q1<{ attention_reason: string | null }>("SELECT attention_reason FROM reservations WHERE id = ?", b.id)).attention_reason).toBeNull();
  });
});

describe("email outbox", () => {
  it("queues confirmations for overrides and cancellations, once each", async () => {
    const b = await heldBooking(2);
    await rejects(overridePaymentRequirement(db, gm, b.id, "confirm", "Corporate client, pays on invoice"), /only when paid in full/);
    await overridePaymentRequirement(db, gm, b.id, "extend", "Paying by transfer tomorrow morning");
    await cancelReservation(db, gm, b.id, "Plans changed");
    const kinds = (await q<{ kind: string }>("SELECT kind FROM email_outbox WHERE reservation_id = ? ORDER BY created_at", b.id)).map((k) => k.kind);
    expect(kinds).toEqual(["reservation_cancelled"]);
  });

  it("is written in the same transaction: a failed confirmation queues nothing", async () => {
    const b = await heldBooking();
    await rejects(
      db.batch([db.prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ?").bind(b.id), db.prepare("INSERT INTO _guard (ok) VALUES (0)")]),
      /stale_state/,
    );
    expect(await q("SELECT 1 FROM email_outbox WHERE reservation_id = ?", b.id)).toHaveLength(0);
  });

  it("two senders never claim the same email", async () => {
    for (let i = 0; i < 4; i++) {
      const b = await heldBooking();
      await offline(b.id, 10_000_000);
    }
    const [a, c] = await Promise.all([claimOutbox(db, { limit: 50 }), claimOutbox(db, { limit: 50 })]);
    const ids = [...a, ...c].map((r) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("retries with back-off and gives up after five attempts", async () => {
    const b = await heldBooking();
    const { paymentId } = await offline(b.id, 10_000_000);
    const row = await q1<{ id: string }>("SELECT id FROM email_outbox WHERE payment_id = ?", paymentId);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await exec("UPDATE email_outbox SET next_attempt_at = ? WHERE id = ?", iso(-1000), row.id);
      const claimed = await claimOutbox(db, { reservationId: b.id });
      expect(claimed.map((c) => c.id)).toContain(row.id);
      const after = await q1<{ next_attempt_at: string; attempts: number }>("SELECT next_attempt_at, attempts FROM email_outbox WHERE id = ?", row.id);
      expect(after.attempts).toBe(attempt);
      expect(Date.parse(after.next_attempt_at)).toBeGreaterThan(Date.now());
      await finishOutbox(db, row.id, "retry", "Resend down");
    }
    expect((await q1<{ status: string }>("SELECT status FROM email_outbox WHERE id = ?", row.id)).status).toBe("failed");
  });

  it("claims a given reservation's emails first", async () => {
    const b = await heldBooking();
    await offline(b.id, 10_000_000);
    const claimed = await claimOutbox(db, { reservationId: b.id });
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed.every((c) => c.reservation_id === b.id)).toBe(true);
  });
});

describe("rate limiting", () => {
  it("allows the limit, then refuses within the window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(db, key, 3, 3600));
    expect(results).toEqual([true, true, true, false]);
    expect(await hitRateLimit(db, `other:${crypto.randomUUID()}`, 3, 3600)).toBe(true);
  });
});

describe("payment corrections (payments are never edited)", () => {
  it("records a linked correction with its own receipt, adjusts the balance and flags money owed", async () => {
    const b = await heldBooking(1, 5_000_000);
    const pay = await offline(b.id, 10_000_000); // confirms
    const fix = await recordPaymentCorrection(db, gm, { paymentId: pay.paymentId, amountKobo: 1_000_000, reason: "Typed 100k instead of 90k" });
    expect(fix.receiptNumber).toMatch(/^RCT-/);
    expect(fix.balanceKobo).toBe(1_000_000);
    const row = await q1<{ kind: string; corrects_payment_id: string; recorded_by: string }>(
      "SELECT kind, corrects_payment_id, recorded_by FROM payments WHERE receipt_number = ?", fix.receiptNumber);
    expect(row).toEqual({ kind: "refund", corrects_payment_id: pay.paymentId, recorded_by: gm!.id });
    expect((await q1<{ amount_kobo: number }>("SELECT amount_kobo FROM payments WHERE id = ?", pay.paymentId)).amount_kobo).toBe(10_000_000);
    expect((await q1<{ attention_reason: string }>("SELECT attention_reason FROM reservations WHERE id = ?", b.id)).attention_reason).toMatch(/now owed/);
  });

  it("can't exceed the original payment, needs a reason, and is managers only", async () => {
    const b = await heldBooking(1, 5_000_000);
    const pay = await offline(b.id, 10_000_000);
    await rejects(recordPaymentCorrection(db, desk, { paymentId: pay.paymentId, amountKobo: 100, reason: "Wrong amount" }), /role can't do this/);
    await rejects(recordPaymentCorrection(db, gm, { paymentId: pay.paymentId, amountKobo: 100, reason: "x" }), /Say what was wrong/);
    await recordPaymentCorrection(db, gm, { paymentId: pay.paymentId, amountKobo: 3_000_000, reason: "Partly wrong" });
    await rejects(recordPaymentCorrection(db, gm, { paymentId: pay.paymentId, amountKobo: 7_000_100, reason: "Wrong again" }), /At most .* can still be corrected/);
  });

  it("the database refuses an unlinked or oversized correction", async () => {
    const b = await heldBooking(1, 5_000_000);
    const pay = await offline(b.id, 10_000_000);
    await rejects(
      exec(
        `INSERT INTO payments (id, reservation_id, kind, amount_kobo, provider, method, status, paid_at, verified_at, recorded_by, corrects_payment_id)
         VALUES (?, ?, 'refund', 20000000, 'offline', 'cash', 'successful', ?, ?, ?, ?)`,
        crypto.randomUUID(), b.id, iso(0), iso(0), desk!.id, pay.paymentId,
      ),
      /invalid_correction/,
    );
  });
});
