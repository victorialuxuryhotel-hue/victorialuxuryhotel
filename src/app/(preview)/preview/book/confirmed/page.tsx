import { BookingConfirmed } from "@/components/booking/outcome";
import { Container } from "@/components/public/section";
import { chosen, search } from "../_search";

export default function Page() {
  return (
    <Container className="py-16 sm:py-24">
      <BookingConfirmed
        stay={{ reference: "VL-7KQ3PM", guestName: "Adaeze Okafor", email: "adaeze@example.com", category: chosen.name, checkIn: search.checkIn, checkOut: search.checkOut, nights: chosen.nights, guests: search.guests, paidKobo: chosen.totalKobo, receiptNumber: "RCT-2026-000041", checkInTime: "2:00 pm", checkOutTime: "12:00 noon" }}
      />
    </Container>
  );
}
