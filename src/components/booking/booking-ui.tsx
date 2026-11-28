import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

export const bookingSteps = ["Room", "Your details", "Pay", "Confirmed"] as const;
/** How the phone shows each step (designs M6, M2, M7, M8). */
const phoneSteps = ["Dates and room", "Your details", "Check and pay", "Confirmed"] as const;

/** Progress through the booking: numbered circles on a computer (G4–G7), four bars on a phone (M2, M6–M8). */
export function Steps({ current }: { current: number }) {
  const total = bookingSteps.length;
  return (
    <>
      <div className="lg:hidden">
        <div className="grid grid-cols-4 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-label="Booking progress">
          {bookingSteps.map((s, i) => (
            <span key={s} className={cn("h-1 rounded-full", i <= current ? "bg-navy-900" : "bg-hairline")} />
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold tracking-[0.04em] text-muted uppercase tabular-nums">
          Step {current + 1} of {total} · {phoneSteps[current]}
        </p>
      </div>
      <ol aria-label="Booking progress" className="hidden items-center gap-2.5 lg:flex">
        {bookingSteps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} aria-current={active ? "step" : undefined} className="flex items-center gap-2.5">
              <span className={cn("flex items-center gap-2 text-sm", active ? "font-semibold text-ink-900" : done ? "font-medium text-ink-900" : "font-medium text-muted")}>
                <span
                  className={cn(
                    "flex size-[26px] items-center justify-center rounded-full border-2 text-xs font-bold",
                    done ? "border-navy-900 bg-navy-900 text-white" : active ? "border-navy-900 bg-white text-navy-900" : "border-[#eae7df] bg-[#eae7df] text-muted",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-label="Done" /> : i + 1}
                </span>
                {s}
              </span>
              {i < total - 1 ? <span aria-hidden className="h-0.5 w-10 bg-hairline" /> : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Checking availability" aria-busy className="space-y-3.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-5 rounded-[14px] border border-hairline bg-white p-4">
          <div className="skeleton h-[90px] w-[110px] lg:h-[130px] lg:w-[200px]" />
          <div className="flex-1 space-y-2.5 py-2">
            <div className="skeleton h-5 w-2/5" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export type StaySearch = { checkIn: string; checkOut: string; guests: number };

/** Extras the guest has ticked, with what each costs for this stay. */
export type ExtraLine = { name: string; kobo: number };

/** "Sat 5 – Mon 7 Dec" */
export function stayDates(checkIn: string, checkOut: string) {
  const from = formatDate(checkIn, { year: false });
  return `${checkIn.slice(0, 7) === checkOut.slice(0, 7) ? from.replace(/ \w+$/, "") : from} – ${formatDate(checkOut, { year: false })}`;
}

/** The "Your stay" box beside each booking step (designs G4–G6). Rows are label and value; the total is largest. */
export function StayAside({ rows, totalKobo, children, className }: { rows: Array<[string, string]>; totalKobo: number; children?: ReactNode; className?: string }) {
  return (
    <aside aria-label="Your stay" className={cn("flex flex-col gap-3 self-start rounded-[14px] border border-hairline bg-ivory-100 p-5 tabular-nums lg:sticky lg:top-24", className)}>
      <p className="text-base font-bold">Your stay</p>
      <dl className="flex flex-col gap-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
          <dt className="text-[15px]">Total</dt>
          <dd className="text-[26px] font-bold" aria-live="polite">{formatNaira(totalKobo)}</dd>
        </div>
      </dl>
      {children}
    </aside>
  );
}
