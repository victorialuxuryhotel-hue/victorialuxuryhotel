import { StayAside, Steps, stayDates } from "@/components/booking/booking-ui";
import { formatNaira } from "@/lib/format";
import { GuestDetailsForm } from "@/components/booking/guest-details-form";
import { Container } from "@/components/public/section";
import { chosen, search } from "../_search";
import { previewBooking } from "../actions";

export default function Page() {
  return (
    <Container className="py-10 sm:py-14">
      <Steps current={2} />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <GuestDetailsForm action={previewBooking} hidden={{}} cancellationPolicy={null} />
        <StayAside rows={[["Dates", stayDates(search.checkIn, search.checkOut)], ["Guests", String(search.guests)], [chosen.name, formatNaira(chosen.totalKobo)]]} totalKobo={chosen.totalKobo} />
      </div>
    </Container>
  );
}
