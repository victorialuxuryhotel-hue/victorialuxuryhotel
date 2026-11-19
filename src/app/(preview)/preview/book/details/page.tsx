import { BookingSummary, Steps } from "@/components/booking/booking-ui";
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
        <BookingSummary option={chosen} search={search} />
      </div>
    </Container>
  );
}
