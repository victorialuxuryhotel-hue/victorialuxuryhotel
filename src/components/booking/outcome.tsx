import Link from "next/link";
import { CheckCircle2, Clock, Mail, MapPin, Phone, XCircle } from "lucide-react";
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
};

/** Shown only after the server has verified payment with Paystack. */
export function BookingConfirmed({ stay }: { stay: ConfirmedStay }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <CheckCircle2 className="mx-auto size-14 text-success-600" strokeWidth={1.5} aria-hidden />
      <h1 className="mt-6 font-display text-5xl text-navy-950">You&apos;re booked, {stay.guestName.split(" ")[0]}</h1>
      <p className="mt-3 text-ink-600">
        Payment received and your reservation is confirmed. We&apos;ve emailed the details to <span className="font-medium text-ink-900">{stay.email}</span>.
      </p>

      <div className="mt-10 overflow-hidden rounded-card bg-ivory-50 text-left shadow-card">
        <div className="flex items-center justify-between bg-navy-950 px-6 py-4 text-ivory-50">
          <span className="text-xs uppercase tracking-[0.2em] text-gold-300">Booking reference</span>
          <span className="font-mono text-lg tracking-wider">{stay.reference}</span>
        </div>
        <dl className="grid gap-5 p-6 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-500">Room</dt><dd className="mt-1 font-medium text-ink-900">{stay.category}</dd></div>
          <div><dt className="text-ink-500">Guests</dt><dd className="mt-1 font-medium text-ink-900">{stay.guests}</dd></div>
          <div><dt className="text-ink-500">Check-in</dt><dd className="mt-1 font-medium text-ink-900">{formatDate(stay.checkIn)}, from {stay.checkInTime}</dd></div>
          <div><dt className="text-ink-500">Check-out</dt><dd className="mt-1 font-medium text-ink-900">{formatDate(stay.checkOut)}, by {stay.checkOutTime}</dd></div>
          <div><dt className="text-ink-500">Paid</dt><dd className="mt-1 font-medium text-ink-900">{formatNaira(stay.paidKobo)} · {plural(stay.nights, "night")}</dd></div>
          <div><dt className="text-ink-500">Receipt</dt><dd className="mt-1 font-mono text-ink-900">{stay.receiptNumber}</dd></div>
        </dl>
        <div className="grid gap-3 border-t border-hairline bg-ivory-50 p-6 text-sm sm:grid-cols-3">
          <a href={hotel.mapsUrl} className="flex items-center gap-2 text-navy-800 hover:text-gold-600"><MapPin className="size-4" aria-hidden />Directions</a>
          <a href={`tel:${hotel.phone}`} className="flex items-center gap-2 text-navy-800 hover:text-gold-600"><Phone className="size-4" aria-hidden />Call the hotel</a>
          <a href={`mailto:${hotel.email}`} className="flex items-center gap-2 text-navy-800 hover:text-gold-600"><Mail className="size-4" aria-hidden />Email us</a>
        </div>
      </div>
      <Link href="/" className={buttonStyles({ variant: "secondary", className: "mt-10" })}>Back to the website</Link>
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
