import { RoomOptions, SearchSummary, Steps } from "@/components/booking/booking-ui";
import { Container } from "@/components/public/section";
import { availability } from "../../_sample";
import { search } from "../_search";

export default function Page() {
  return (
    <Container className="py-10 sm:py-14">
      <Steps current={1} />
      <h1 className="mt-8 font-display text-4xl text-navy-950 sm:text-5xl">Choose your room</h1>
      <div className="mt-6"><SearchSummary search={search} editHref="/book" /></div>
      <div className="mt-8"><RoomOptions options={availability} selectHref={() => "/preview/book/details"} /></div>
    </Container>
  );
}
