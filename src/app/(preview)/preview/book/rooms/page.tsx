import { Suspense } from "react";
import { Steps } from "@/components/booking/booking-ui";
import { RoomResults } from "@/components/booking/room-results";
import { StaySummaryBar } from "@/components/booking/stay-summary-bar";
import { Container } from "@/components/public/section";
import { availability } from "../../_sample";
import { search } from "../_search";

type Props = { searchParams: Promise<{ guests?: string }> };

async function Content({ searchParams }: Props) {
  const guests = Number((await searchParams).guests) || search.guests;
  const options = availability.map((o) => ({
    ...o,
    isAvailable: o.isAvailable && o.maxOccupancy >= guests,
    freeFrom: o.slug === "apartment" ? "2026-12-08" : undefined,
  }));
  const stay = { ...search, guests };
  return (
    <>
      <div className="mt-4"><StaySummaryBar checkIn={stay.checkIn} checkOut={stay.checkOut} guests={guests} nights={options[0]!.nights} /></div>
      <div className="mt-6"><RoomResults options={options} stay={stay} selectHref={() => "/preview/book/details"} /></div>
    </>
  );
}

export default function Page(props: Props) {
  return (
    <Container className="py-10 sm:py-14">
      <Steps current={1} />
      <h1 className="mt-8 font-display text-4xl text-navy-950 sm:text-5xl">Choose your room</h1>
      <Suspense><Content {...props} /></Suspense>
    </Container>
  );
}
