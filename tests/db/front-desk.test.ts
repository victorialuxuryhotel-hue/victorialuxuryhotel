// Walk-in, check-in with a registration card, check-out and the refund limit (FUNCTIONALITY.md sections 4–7).
import { describe, expect, it } from "vitest";
import { createStaffProfile } from "@/server/domain/admin";
import { checkInWithCard, checkOutGuest, last4, normalisePhone, refundLimit, registrationFor, requestRefund, walkIn } from "@/server/domain/front-desk";
import { recordOfflinePayment } from "@/server/domain/payments";
import { day, db, desk, exec, gm, insertReservation, makeCategory, owner, q, q1, rejects, status } from "./helpers";

const rand = () => crypto.randomUUID().slice(0, 8);
const card = { idType: "nin", idLast4: "1234567 4821", address: "12 Adeyemi St, Ibadan", comingFrom: "Ibadan", nationality: "Nigerian", purpose: "business", rulesAccepted: true };
const cash = { method: "cash" as const, confirmReceived: true };

async function walkInFor(categoryId: string, roomId: string, extra: Partial<Parameters<typeof walkIn>[2]> = {}) {
  return walkIn(db, desk, { requestId: crypto.randomUUID(), fullName: "Aisha Bello", phone: `0806 ${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, nights: 1, guests: 1, categoryId, roomId, payment: cash, card, ...extra });
}

describe("walk-in", () => {
  it("pay and check in: guest, booking, payment with receipt, room, check-in and the card in one go", async () => {
    const c = await makeCategory(2, { rateKobo: 8_500_000 });
    const w = await walkInFor(c.id, c.roomIds[0]!);
    expect(w.checkedIn).toBe(true);
    expect(w.receiptNumber).toMatch(/^RCT-/);
    expect(await status(w.id)).toBe("checked_in");
    expect(await q1("SELECT room_id, source, total_amount_kobo FROM reservations WHERE id = ?", w.id)).toEqual({ room_id: c.roomIds[0], source: "walk_in", total_amount_kobo: 8_500_000 });
    expect(await q1("SELECT id_last4, id_type FROM guest_registrations WHERE reservation_id = ?", w.id)).toEqual({ id_last4: "4821", id_type: "nin" });
    expect((await q1<{ phone: string }>("SELECT g.phone FROM guests g JOIN reservations r ON r.guest_id = g.id WHERE r.id = ?", w.id)).phone).toMatch(/^\+2348\d{9}$/);
  });

  it("if the payment fails its checks, nothing is created", async () => {
    const c = await makeCategory(1);
    const id = crypto.randomUUID();
    await rejects(walkIn(db, desk, { requestId: id, fullName: "Kunle Ojo", phone: "08031234567", nights: 1, guests: 1, categoryId: c.id, roomId: c.roomIds[0], payment: { method: "pos_terminal", slipLast4: "12", terminal: "Front desk terminal", confirmReceived: true }, card }), /last 4 digits/);
    expect(await q("SELECT 1 FROM reservations WHERE id = ?", id)).toHaveLength(0);
    // A database failure part-way (the room just taken) leaves nothing behind either.
    const first = await walkInFor(c.id, c.roomIds[0]!);
    expect(first.checkedIn).toBe(true);
    const c2 = await makeCategory(2);
    await exec("UPDATE rooms SET category_id = ? WHERE id = ?", c2.id, c.roomIds[0]); // the same room offered under another type
    const id2 = crypto.randomUUID();
    await rejects(walkIn(db, desk, { requestId: id2, fullName: "Second Desk", phone: "08039999999", nights: 1, guests: 1, categoryId: c2.id, roomId: c.roomIds[0], payment: cash, card }), /Room .* was just taken/, "CONFLICT");
    expect(await q("SELECT 1 FROM reservations WHERE id = ?", id2)).toHaveLength(0);
    expect(await q("SELECT 1 FROM payments WHERE reservation_id = ?", id2)).toHaveLength(0);
  });

  it("a room must be clean and ready; the registration card is required", async () => {
    const c = await makeCategory(1);
    await exec("UPDATE rooms SET readiness = 'needs_cleaning' WHERE id = ?", c.roomIds[0]);
    await rejects(walkInFor(c.id, c.roomIds[0]!), /isn't clean and ready/);
    await exec("UPDATE rooms SET readiness = 'ready' WHERE id = ?", c.roomIds[0]);
    await rejects(walkInFor(c.id, c.roomIds[0]!, { card: { ...card, rulesAccepted: false } }), /Complete the registration card/);
  });

  it("save without paying: unpaid, no room, held for 6 hours", async () => {
    const c = await makeCategory(1);
    const w = await walkInFor(c.id, c.roomIds[0]!, { payment: null, roomId: null, card: null });
    expect(w.checkedIn).toBe(false);
    const r = await q1<{ status: string; room_id: string | null; hold_expires_at: string }>("SELECT status, room_id, hold_expires_at FROM reservations WHERE id = ?", w.id);
    expect(r.status).toBe("pending_payment");
    expect(r.room_id).toBeNull();
    const hours = (Date.parse(r.hold_expires_at) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(5.9);
    expect(hours).toBeLessThan(6.1);
  });

  it("phone numbers are stored as +234", () => {
    expect(normalisePhone("0806 220 1934")).toBe("+2348062201934");
    expect(normalisePhone("+234 806 220 1934")).toBe("+2348062201934");
    expect(normalisePhone("12")).toBeNull();
  });
});

describe("check-in with a registration card", () => {
  it("only the last 4 characters of the ID are stored and shown; the card is required to check in", async () => {
    expect(last4("A12345678")).toBe("5678");
    expect(last4("abc-12x9")).toBe("12X9");
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), rateKobo: 5_000_000, roomId: c.roomIds[0], status: "confirmed", unpaid: true });
    await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    await rejects(checkInWithCard(db, desk, r, { ...card, address: "" }), /Complete the registration card/);
    expect(await status(r)).toBe("confirmed");
    await checkInWithCard(db, desk, r, { ...card, idLast4: "12345678901" });
    expect(await status(r)).toBe("checked_in");
    const row = await q1<Record<string, string>>("SELECT * FROM guest_registrations WHERE reservation_id = ?", r);
    expect(row.id_last4).toBe("8901");
    expect(JSON.stringify(row)).not.toContain("12345678901");
    const log = await q("SELECT summary, metadata FROM activity_log WHERE entity_id = ?", r);
    expect(JSON.stringify(log)).not.toContain("1234567");
    await rejects(exec("INSERT INTO guest_registrations (reservation_id, id_type, id_last4, address, coming_from, nationality, purpose, rules_accepted_at, recorded_by) VALUES (?, 'nin', '12345', 'x x x', 'Ib', 'NG', 'business', 'x', ?)", crypto.randomUUID(), desk!.id), /CHECK constraint/);
  });

  it("a returning guest's last card is offered; check-in is still blocked while money is owed", async () => {
    const c = await makeCategory(2, { rateKobo: 5_000_000 });
    const first = await walkInFor(c.id, c.roomIds[0]!);
    const guestId = (await q1<{ guest_id: string }>("SELECT guest_id FROM reservations WHERE id = ?", first.id)).guest_id;
    const next = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), rateKobo: 5_000_000, roomId: c.roomIds[1], status: "confirmed", guestId, unpaid: true });
    expect(await registrationFor(db, desk, next)).toMatchObject({ fromEarlierStay: true, card: { idLast4: "4821", nationality: "Nigerian" } });
    await rejects(checkInWithCard(db, desk, next, card), /owed\. Take the payment before check-in/);
  });
});

describe("check-out", () => {
  async function inHouse(rateKobo = 5_000_000, nights = 2) {
    const c = await makeCategory(1, { rateKobo });
    const r = await insertReservation({ categoryId: c.id, checkIn: day(-1), checkOut: day(nights - 1), rateKobo, roomId: c.roomIds[0], status: "confirmed", unpaid: true });
    await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: rateKobo * nights, method: "cash", paidOn: day(0), confirmReceived: true });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    return { r, roomId: c.roomIds[0]! };
  }

  it("needs the key back; the room goes to cleaning", async () => {
    const { r, roomId } = await inHouse();
    await rejects(checkOutGuest(db, desk, r, { keyReturned: false }), /Get the key back/);
    await checkOutGuest(db, desk, r, { keyReturned: true });
    expect(await status(r)).toBe("checked_out");
    expect((await q1<{ readiness: string }>("SELECT readiness FROM rooms WHERE id = ?", roomId)).readiness).toBe("needs_cleaning");
  });

  it("a balance must be paid, or a manager leaves it owing with a reason", async () => {
    const { r } = await inHouse();
    await exec("UPDATE reservations SET extras_kobo = 1500000 WHERE id = ?", r);
    await rejects(checkOutGuest(db, desk, r, { keyReturned: true }), /₦15,000 owed/);
    await rejects(checkOutGuest(db, desk, r, { keyReturned: true, leaveOwingReason: "Company pays Friday" }), /Only a manager can let a guest leave owing/, "FORBIDDEN");
    await rejects(exec("UPDATE reservations SET status = 'checked_out' WHERE id = ?", r), /not_paid/);
    await checkOutGuest(db, gm, r, { keyReturned: true, leaveOwingReason: "Company pays Friday" });
    expect(await q1("SELECT status, left_owing_by, left_owing_reason FROM reservations WHERE id = ?", r)).toEqual({ status: "checked_out", left_owing_by: gm!.id, left_owing_reason: "Company pays Friday" });
  });
});

describe("refund requests", () => {
  it("a refund can't be more than what was paid less the nights used; a reason is required", async () => {
    // Paid 3 nights, leaving after 1: 2 nights can be refunded.
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(3), rateKobo: 5_000_000, roomId: c.roomIds[0], status: "confirmed", unpaid: true });
    await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 15_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    await exec("UPDATE reservations SET status = 'checked_in' WHERE id = ?", r);
    expect(await refundLimit(db, r)).toMatchObject({ paid: 15_000_000, used: 5_000_000, limit: 10_000_000 });
    await rejects(requestRefund(db, desk, { reservationId: r, amountKobo: 10_000_100, method: "bank_transfer", reason: "Leaving early" }), /At most ₦100,000 can be refunded/);
    await rejects(requestRefund(db, desk, { reservationId: r, amountKobo: 1_000_000, method: "bank_transfer", reason: "" }), /Say why/);
    const id = await requestRefund(db, desk, { reservationId: r, amountKobo: 6_000_000, method: "bank_transfer", reason: "Leaving early" });
    // What's already asked for counts against the limit.
    expect((await refundLimit(db, r)).limit).toBe(4_000_000);
    await rejects(requestRefund(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "cash", reason: "Second ask" }), /At most ₦40,000/);
    // Nobody decides their own request, and a decision is final.
    await rejects(exec("UPDATE refund_requests SET decided_by = ?, decided_at = 'x', decision = 'declined' WHERE id = ?", desk!.id, id), /CHECK constraint/);
    await exec("UPDATE refund_requests SET decided_by = ?, decided_at = 'x', decision = 'declined' WHERE id = ?", gm!.id, id);
    await rejects(exec("UPDATE refund_requests SET decision_note = 'changed' WHERE id = ?", id), /refund_decided/);
  });

  it("nothing can be refunded when everything paid was used; only desk roles and managers ask", async () => {
    const c = await makeCategory(1, { rateKobo: 5_000_000 });
    const r = await insertReservation({ categoryId: c.id, checkIn: day(0), checkOut: day(1), rateKobo: 5_000_000, roomId: c.roomIds[0], status: "confirmed", unpaid: true });
    await recordOfflinePayment(db, desk, { reservationId: r, amountKobo: 5_000_000, method: "cash", paidOn: day(0), confirmReceived: true });
    await rejects(requestRefund(db, desk, { reservationId: r, amountKobo: 100, method: "cash", reason: "Not happy" }), /Nothing can be refunded/);
    const fin = await createStaffProfile(db, owner, { fullName: "Fin Ance", email: `fin-${rand()}@example.com`, role: "finance" });
    await rejects(requestRefund(db, { id: fin, role: "finance" }, { reservationId: r, amountKobo: 100, method: "cash", reason: "Not happy" }), /role can't do this/);
  });
});
