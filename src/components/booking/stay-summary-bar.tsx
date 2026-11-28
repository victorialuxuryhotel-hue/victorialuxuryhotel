"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { BookingBar } from "@/components/public/booking-bar";
import { GuestsPicker, partyLabel, type Party } from "@/components/public/guests-picker";
import { RangeCalendar } from "@/components/public/range-calendar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tonight } from "@/lib/hotel-date";

const noop = () => () => {};

/**
 * The stay being booked, changeable in place. Computer: the search bar (G4). Phone: the month calendar and
 * the guests field (M6); picking a departure day or closing the guests sheet searches again.
 */
export function StaySummaryBar({ checkIn, checkOut, guests, room }: { checkIn: string; checkOut: string; guests: number; nights?: number; room?: string }) {
  const router = useRouter();
  const path = usePathname();
  const today = useSyncExternalStore(noop, () => tonight(), () => "");
  const [range, setRange] = useState({ start: checkIn, end: checkOut });
  const [party, setParty] = useState<Party>({ adults: guests, children: 0 });
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const search = (start: string, end: string, count: number) => {
    const q = new URLSearchParams({ checkIn: start, checkOut: end, guests: String(count) });
    if (room) q.set("room", room);
    router.replace(`${path}?${q}`, { scroll: false });
  };

  return (
    <>
      <div className="hidden lg:block lg:max-w-[880px]">
        <BookingBar defaults={{ checkIn, checkOut, guests: String(guests) }} />
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        <RangeCalendar
          start={range.start}
          end={range.end}
          min={today || checkIn}
          onChange={(start, end) => {
            const picked = start === range.start && end !== range.end;
            setRange({ start, end });
            if (picked) search(start, end, party.adults + party.children);
          }}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted" id="stay-guests">Guests</span>
          <button
            ref={trigger}
            type="button"
            aria-labelledby="stay-guests stay-guests-value"
            onClick={() => setOpen(true)}
            className="flex h-11 items-center justify-between rounded-lg border border-[#bdb7a8] bg-white px-3 text-sm"
          >
            <span id="stay-guests-value">{partyLabel(party)}</span>
            <ChevronDown className="size-4 text-muted" aria-hidden />
          </button>
        </div>
      </div>
      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
          if (party.adults + party.children !== guests) search(range.start, range.end, party.adults + party.children);
        }}
        title="Who's staying?"
        trigger={trigger}
      >
        <GuestsPicker
          party={party}
          onChange={setParty}
          onDone={() => {
            setOpen(false);
            if (party.adults + party.children !== guests) search(range.start, range.end, party.adults + party.children);
          }}
          large
        />
      </BottomSheet>
    </>
  );
}
