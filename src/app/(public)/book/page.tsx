import type { Metadata } from "next";
import { Suspense } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { Steps } from "@/components/booking/booking-ui";
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
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = { checkIn: one(sp.checkIn), checkOut: one(sp.checkOut), guests: one(sp.guests) ?? "2" };
  const parsed = staySchema.safeParse(raw);

  if (!raw.checkIn || !raw.checkOut) {
    return (
      <>
        <Steps current={0} />
        <h1 className="mt-8 font-display text-4xl text-navy-950 sm:text-5xl">When would you like to stay?</h1>
        <p className="mt-3 max-w-xl text-ink-600">Choose your dates and number of guests to see available rooms and the total for your stay.</p>
        <div className="mt-8"><BookingBar variant="inline" defaults={{ guests: raw.guests }} /></div>
      </>
    );
  }

  const result = parsed.success ? await searchStay(parsed.data) : { ok: false as const, message: "Please choose valid dates." };
  if (!result.ok || !parsed.success) {
    return (
      <>
        <Steps current={0} />
        <div className="mt-8"><FormMessage>{result.ok ? "Please choose valid dates." : result.message}</FormMessage></div>
        <div className="mt-6"><BookingBar variant="inline" defaults={raw} /></div>
      </>
    );
  }

  const stay = parsed.data;
  const anyAvailable = result.options.some((o) => o.isAvailable);
  const qs = (slug: string) => new URLSearchParams({ category: slug, checkIn: stay.checkIn, checkOut: stay.checkOut, guests: String(stay.guests) }).toString();
  return (
    <>
      <Steps current={1} />
      <h1 className="mt-8 font-display text-4xl text-navy-950 sm:text-5xl">Choose your room</h1>
      <div className="mt-4">
        <StaySummaryBar checkIn={stay.checkIn} checkOut={stay.checkOut} guests={stay.guests} nights={result.options[0]?.nights ?? 1} />
      </div>
      {!anyAvailable ? (
        <div className="mt-8 rounded-card border border-gold-300/60 bg-gold-50 p-6">
          <p className="font-medium text-navy-950">We&apos;re fully booked for those dates</p>
          <p className="mt-1 text-sm text-ink-700">Try different dates, or contact us and we&apos;ll do our best to help.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={`tel:${hotel.phone}`} className={buttonStyles({ className: "h-11 min-w-28" })}><Phone className="size-4" aria-hidden /> Call</a>
            <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", className: "h-11 min-w-28" })}><MessageCircle className="size-4" aria-hidden /> WhatsApp</a>
          </div>
        </div>
      ) : null}
      <div className="mt-6"><RoomResults options={result.options} stay={stay} selectHref={(o) => `/book/details?${qs(o.slug)}`} /></div>
    </>
  );
}

export default function BookPage(props: PageProps<"/book">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-ivory-200" />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
