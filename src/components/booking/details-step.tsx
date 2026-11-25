"use client";

import { useState, type ReactNode } from "react";
import type { AvailabilityOption } from "@/domain/views";
import { extraCost, stayPrice } from "@/domain/pricing";
import { formatNaira } from "@/lib/format";
import type { ActionResult } from "@/lib/errors";
import { BookingSummary, CompactSummary, type ExtraLine } from "./booking-ui";
import { GuestDetailsForm } from "./guest-details-form";

type Extra = { id: string; name: string; price_kobo: number; per_night: number };
type StaySearch = { checkIn: string; checkOut: string; guests: number };

/**
 * Booking step 3: the guest's details and extras. Ticking an extra updates every total on the
 * page at once, priced by the same function the server uses (domain/pricing.ts).
 */
export function DetailsStep({
  option, search, holdMinutes, extras, action, hidden, cancellationPolicy, sidebarNote,
}: {
  option: AvailabilityOption;
  search: StaySearch;
  holdMinutes: number;
  extras: Extra[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  cancellationPolicy: string | null;
  sidebarNote: ReactNode;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const picked = extras.filter((e) => chosen.has(e.id));
  const priced = picked.map((e) => ({ priceKobo: e.price_kobo, perNight: e.per_night === 1 }));
  const total = stayPrice({ nightlyRateKobo: option.nightlyRateKobo, nights: option.nights, extras: priced }).totalKobo;
  const lines: ExtraLine[] = picked.map((e) => ({ name: e.name, kobo: extraCost({ priceKobo: e.price_kobo, perNight: e.per_night === 1 }, option.nights) }));
  const toggle = (id: string, on: boolean) =>
    setChosen((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <>
      <CompactSummary option={option} search={search} holdMinutes={holdMinutes} extras={lines} totalKobo={total} />
      <GuestDetailsForm
        total={formatNaira(total)}
        action={action}
        hidden={hidden}
        cancellationPolicy={cancellationPolicy}
        extras={extras}
        nights={option.nights}
        chosen={chosen}
        onToggle={toggle}
      />
      <BookingSummary option={option} search={search} className="hidden lg:block" extras={lines} totalKobo={total}>
        {sidebarNote}
      </BookingSummary>
    </>
  );
}
