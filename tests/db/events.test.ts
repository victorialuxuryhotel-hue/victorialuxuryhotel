import { describe, expect, it } from "vitest";
import { createHallBooking, listHallBookings, recordHallPayment, setHallStatus } from "@/server/domain/events";
import { day, db, desk, gm, rejects } from "./helpers";

const base = { customerName: "Acme Ltd", phone: null, email: null, guests: 40, priceKobo: 30_000_000, notes: null };

describe("hall bookings", () => {
  it("refuses two confirmed events at once; payments can't exceed the price", async () => {
    const date = day(90 + Math.floor(Math.random() * 200));
    const a = await createHallBooking(db, desk, { ...base, title: "Training", eventDate: date, startTime: "09:00", endTime: "13:00", status: "confirmed" });
    await rejects(createHallBooking(db, desk, { ...base, title: "Clash", eventDate: date, startTime: "12:00", endTime: "15:00", status: "confirmed" }), /already booked/);
    const enquiry = await createHallBooking(db, desk, { ...base, title: "Maybe", eventDate: date, startTime: "12:00", endTime: "15:00", status: "enquiry" });
    await rejects(setHallStatus(db, desk, enquiry, "confirmed"), /already booked/);
    await createHallBooking(db, gm, { ...base, title: "Afternoon", eventDate: date, startTime: "13:00", endTime: "17:00", status: "confirmed" });

    await recordHallPayment(db, desk, { bookingId: a, amountKobo: 10_000_000, method: "bank_transfer", paidOn: day(0), reference: null });
    await rejects(recordHallPayment(db, desk, { bookingId: a, amountKobo: 25_000_000, method: "cash", paidOn: day(0), reference: null }), /still due/);
    expect((await listHallBookings(db, desk)).find((b) => b.id === a)!.paid_kobo).toBe(10_000_000);
    await setHallStatus(db, desk, a, "cancelled");
    await rejects(recordHallPayment(db, desk, { bookingId: a, amountKobo: 1_000, method: "cash", paidOn: day(0), reference: null }), /cancelled/);
  });
});
