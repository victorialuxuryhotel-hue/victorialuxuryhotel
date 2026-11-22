import Link from "next/link";
import { CalendarPlus, Check, Clock, MapPin, Share2, XCircle } from "lucide-react";
import { CopyButton } from "./copy-button";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { formatDate, formatNaira, plural } from "@/lib/format";

export type ConfirmedStay = {
  reference: string;
  guestName: string;
  email: string;
  category: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  paidKobo: number;
  receiptNumber: string;
  /** From hotel settings, e.g. "2:00 pm". */
  checkInTime: string;
  checkOutTime: string;
  /** The specific room, e.g. "Room 204 · Floor 2" (assigned on payment). */
  room?: string;
  /** The booking's private link token, for the calendar file (never shared). */
  token: string;
  siteUrl: string;
};

/** Shown only after the server has verified payment with Paystack (6b). */
export function BookingConfirmed({ stay }: { stay: ConfirmedStay }) {
  // Shared with friends or family: the stay and the hotel only. The private
  // booking link (which opens the receipt) and the reference stay with the guest.
  const share = `https://wa.me/?text=${encodeURIComponent(`I'm staying at ${hotel.name}, ${formatDate(stay.checkIn)} to ${formatDate(stay.checkOut)}. ${stay.siteUrl}`)}`;
  const rows: Array<[string, string]> = [
    ["Room", `${stay.room ? `${stay.room} · ` : ""}${stay.category} · ${plural(stay.guests, "guest")}`],
    ["Check-in", `${formatDate(stay.checkIn)}, from ${stay.checkInTime}`],
    ["Check-out", `${formatDate(stay.checkOut)}, by ${stay.checkOutTime}`],
    ["Paid", formatNaira(stay.paidKobo)],
  ];
  const action = "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border border-hairline px-2 text-xs text-ink-900 hover:bg-ink-900/7";
  return (
    <div className="mx-auto max-w-xl">
      <div className="border-b border-hairline pb-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-gold-500 text-gold-700"><Check className="size-6" aria-hidden /></span>
        <h1 className="mt-4 font-display text-[2.25rem] leading-[1.05] text-navy-950 sm:text-5xl">You&apos;re booked, {stay.guestName.split(" ")[0]}</h1>
        <p className="mt-3 text-ink-700">
          Payment received.{stay.email ? <> A confirmation is on its way to <span className="break-all text-ink-900">{stay.email}</span>.</> : null}
        </p>
        <div className="mt-5 inline-flex items-center gap-3 rounded-md border border-hairline py-1.5 pr-1.5 pl-4 text-left">
          <span>
            <span className="block text-xs tracking-[0.16em] text-ink-500 uppercase">Reference</span>
            <span className="block text-lg tracking-[0.06em] text-navy-950 tabular-nums">{stay.reference}</span>
          </span>
          <CopyButton text={stay.reference} />
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-b border-hairline py-2.5 text-ink-500">{k}</dt>
            <dd className="border-b border-hairline py-2.5 text-right text-ink-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <a href={`/book/confirmation/${stay.token}/calendar`} className={action}><CalendarPlus className="size-4" aria-hidden />Calendar</a>
        <a href={hotel.mapsUrl} target="_blank" rel="noreferrer" className={action}><MapPin className="size-4" aria-hidden />Directions</a>
        <a href={share} target="_blank" rel="noreferrer" className={action}><Share2 className="size-4" aria-hidden />Share</a>
      </div>

      <section aria-labelledby="next-steps" className="mt-8">
        <h2 id="next-steps" className="font-sans text-xs font-normal tracking-[0.2em] text-ink-500 uppercase">What happens next</h2>
        <ol className="mt-1.5">
          {[
            stay.email ? "Your confirmation and receipt are in your email." : "Keep your booking reference; you'll need it at the front desk.",
            `Arrive from ${stay.checkInTime}. Your room key is waiting at the front desk.`,
            "Running late? Message us on WhatsApp.",
          ].map((t, i) => (
            <li key={t} className="grid grid-cols-[22px_1fr] gap-2.5 border-t border-hairline py-2.5 text-sm">
              <span className="text-gold-700 tabular-nums">{i + 1}</span>
              <span className="text-ink-800">{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-ink-700">
          Questions? <a href={`https://wa.me/${hotel.whatsapp}`} className="text-navy-800 underline underline-offset-2">WhatsApp us</a> or <a href={`tel:${hotel.phone}`} className="text-navy-800 underline underline-offset-2">call the front desk</a>.
        </p>
        {stay.receiptNumber ? (
          <p className="mt-2 text-sm text-ink-500">
            Receipt <Link href={`/book/receipt/${stay.token}/${stay.receiptNumber}`} className="text-navy-800 underline underline-offset-2">{stay.receiptNumber}</Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** Paystack redirected back but the webhook/verification hasn't completed yet. */
export function PaymentPending({ reference }: { reference: string }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <Clock className="mx-auto size-14 text-gold-500" strokeWidth={1.5} aria-hidden />
      <h1 className="mt-6 font-display text-5xl text-navy-950">Confirming your payment</h1>
      <p className="mt-3 text-ink-600">
        This usually takes a few seconds. Please don&apos;t pay again. We&apos;ll email you as soon as booking <span className="font-mono">{reference}</span> is confirmed.
      </p>
      <div className="mx-auto mt-8 h-1 max-w-xs overflow-hidden rounded-full bg-ivory-200">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-gold-500" />
      </div>
    </div>
  );
}

export function PaymentFailed({ retryHref }: { retryHref: string }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <XCircle className="mx-auto size-14 text-danger-600" strokeWidth={1.5} aria-hidden />
      <h1 className="mt-6 font-display text-5xl text-navy-950">Payment didn&apos;t go through</h1>
      <p className="mt-3 text-ink-600">Your payment wasn&apos;t completed, so your booking isn&apos;t confirmed yet. Your room is held for a short while if you&apos;d like to try again.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={retryHref} className={buttonStyles({ size: "lg" })}>Try again</Link>
        <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", size: "lg" })}>Get help on WhatsApp</a>
      </div>
    </div>
  );
}
