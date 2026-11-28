import type { Metadata } from "next";
import { Suspense } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { ResultsSkeleton, Steps } from "@/components/booking/booking-ui";
import { RoomResults } from "@/components/booking/room-results";
import { StaySummaryBar } from "@/components/booking/stay-summary-bar";
import { BookingBar } from "@/components/public/booking-bar";
import { Container } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { hotel } from "@/config/hotel";
import { searchStay, staySchema } from "@/server/queries/booking";

export const metadata: Metadata = {
  title: "Book your stay",
  description: `Check availability and book online at ${hotel.name}.`,
  alternates: { canonical: "/book" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Booking step 1, choose a room (designs G4, M6). */
async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = { checkIn: one(sp.checkIn), checkOut: one(sp.checkOut), guests: one(sp.guests) ?? "2" };
  const room = one(sp.room);
  const parsed = staySchema.safeParse(raw);

  if (!raw.checkIn || !raw.checkOut) {
    return (
      <>
        <h1 className="font-display text-[32px] leading-tight font-semibold text-ink-900 lg:text-[40px]">When would you like to stay?</h1>
        <p className="-mt-3 max-w-xl text-muted">Choose your dates and number of guests to see available rooms and the total for your stay.</p>
        <div className="lg:max-w-[880px]"><BookingBar defaults={{ guests: raw.guests }} room={room ? { slug: room } : undefined} /></div>
      </>
    );
  }

  const result = parsed.success ? await searchStay(parsed.data) : { ok: false as const, message: "Please choose valid dates." };
  if (!result.ok || !parsed.success) {
    return (
      <>
        <FormMessage>{result.ok ? "Please choose valid dates." : result.message}</FormMessage>
        <div className="lg:max-w-[880px]"><BookingBar defaults={raw} /></div>
      </>
    );
  }

  const stay = parsed.data;
  const anyAvailable = result.options.some((o) => o.isAvailable);
  return (
    <>
      <h1 className="sr-only">Choose your room</h1>
      <StaySummaryBar checkIn={stay.checkIn} checkOut={stay.checkOut} guests={stay.guests} room={room} />
      {!anyAvailable ? (
        <div className="rounded-[14px] border border-[#f5d9a8] bg-[#fff4dc] p-5">
          <p className="font-semibold text-ink-900">We&apos;re fully booked for those dates</p>
          <p className="mt-1 text-sm text-ink-700">Try different dates, or contact us and we&apos;ll do our best to help.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <a href={`tel:${hotel.phone}`} className={buttonStyles()}><Phone className="size-4" aria-hidden /> Call</a>
            <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary" })}><MessageCircle className="size-4" aria-hidden /> WhatsApp</a>
          </div>
        </div>
      ) : null}
      <RoomResults key={`${stay.checkIn}${stay.checkOut}${stay.guests}`} options={result.options} stay={stay} initial={room} />
    </>
  );
}

export default function BookPage(props: PageProps<"/book">) {
  return (
    <Container className="flex flex-col gap-[22px] pt-4 pb-10 lg:pt-8 lg:pb-16">
      <Steps current={0} />
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
