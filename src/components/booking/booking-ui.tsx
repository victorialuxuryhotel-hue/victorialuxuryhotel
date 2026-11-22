import { Check, Lock } from "lucide-react";
import { Photo } from "@/components/public/photo";
import type { AvailabilityOption } from "@/domain/views";
import { formatDate, formatNaira, plural } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

export const bookingSteps = ["Dates", "Room", "Details", "Payment"] as const;

export function Steps({ current }: { current: number }) {
  const total = bookingSteps.length;
  return (
    <>
      {/* Phones: "Step 3 of 4" with a thin progress bar. */}
      <div className="sm:hidden">
        <p className="text-sm text-ink-500 tabular-nums">
          Step {current + 1} of {total} · <span className="text-navy-950">{bookingSteps[current]}</span>
        </p>
        <div className="mt-2 h-0.5 bg-ivory-200" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-label="Booking progress">
          <div className="h-0.5 bg-gold-500" style={{ width: `${((current + 1) / total) * 100}%` }} />
        </div>
      </div>
    <ol aria-label="Booking progress" className="hidden items-center gap-3 text-sm font-medium sm:flex">
      {bookingSteps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} aria-current={active ? "step" : undefined} className="flex items-center gap-2 sm:gap-3">
            <span className={cn("flex items-center gap-2", active || done ? "text-navy-950" : "text-ink-400")}>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs",
                  done ? "bg-gold-500 text-white" : active ? "bg-navy-900 text-white" : "bg-ivory-200 text-ink-500",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn(!active && "hidden sm:inline")}>{s}</span>
            </span>
            {i < bookingSteps.length - 1 ? <span aria-hidden className="h-px w-4 bg-ink-300 sm:w-8" /> : null}
          </li>
        );
      })}
    </ol>
    </>
  );
}

export type StaySearch = { checkIn: string; checkOut: string; guests: number };

/** Search criteria strip with an edit link: guests always see what they searched. */
/**
 * Phones and tablets: the stay and its total ABOVE the form, collapsible, so
 * the price is visible before the guest types anything. The full summary
 * card (BookingSummary with className "hidden lg:block") takes over from lg.
 */
export function CompactSummary({ option, search, holdMinutes }: { option: AvailabilityOption; search: StaySearch; holdMinutes?: number }) {
  return (
    <details open className="group rounded-card border border-ivory-200 bg-white lg:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-xl text-navy-950">{option.name} · {plural(option.nights, "night")}</span>
          <span className="block text-sm text-ink-500 tabular-nums">{formatDate(search.checkIn, { year: false })} → {formatDate(search.checkOut, { year: false })} · {plural(search.guests, "guest")}</span>
        </span>
        <span className="shrink-0 text-base font-semibold text-navy-950 tabular-nums">{formatNaira(option.totalKobo)}</span>
      </summary>
      <dl className="space-y-1.5 border-t border-ivory-200 px-4 py-3 text-sm tabular-nums">
        <div className="flex justify-between gap-4"><dt className="text-ink-500">{formatNaira(option.nightlyRateKobo)} × {plural(option.nights, "night")}</dt><dd>{formatNaira(option.totalKobo)}</dd></div>
        {holdMinutes ? <div className="flex justify-between gap-4"><dt className="text-ink-500">Room held for</dt><dd>{holdMinutes} min</dd></div> : null}
      </dl>
    </details>
  );
}

export function BookingSummary({ option, search, children, className }: { option: AvailabilityOption; search: StaySearch; children?: React.ReactNode; className?: string }) {
  return (
    <aside className={cn("overflow-hidden rounded-card bg-white shadow-card lg:sticky lg:top-28", className)}>
      <Photo photo={{ alt: option.name }} className="aspect-[16/9]" sizes="24rem" />
      <div className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Your stay</p>
        <h2 className="mt-2 font-display text-3xl text-navy-950">{option.name}</h2>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-ink-500">Check-in</dt><dd className="text-right text-ink-900">{formatDate(search.checkIn)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-500">Check-out</dt><dd className="text-right text-ink-900">{formatDate(search.checkOut)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-500">Guests</dt><dd className="text-ink-900">{search.guests}</dd></div>
          <div className="flex justify-between gap-4 border-t border-ivory-200 pt-3"><dt className="text-ink-500">{formatNaira(option.nightlyRateKobo)} × {plural(option.nights, "night")}</dt><dd className="tabular-nums">{formatNaira(option.totalKobo)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-ivory-200 pt-3 text-base font-semibold text-navy-950"><dt>Total</dt><dd className="tabular-nums">{formatNaira(option.totalKobo)}</dd></div>
        </dl>
        {children}
        <p className="mt-6 flex items-center gap-2 text-xs text-ink-500"><Lock className="size-3.5" aria-hidden /> Secure payment by Paystack. We never see your card details.</p>
      </div>
    </aside>
  );
}
