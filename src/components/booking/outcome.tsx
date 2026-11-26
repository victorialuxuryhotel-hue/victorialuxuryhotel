import Link from "next/link";
import { CalendarPlus, Check, Clock, MapPin, MessageCircle, Phone, Share2, XCircle } from "lucide-react";
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
  checkInTime: string;
  checkOutTime: string;
  room?: string;
  token: string;
  siteUrl: string;
};

export function BookingConfirmed({ stay }: { stay: ConfirmedStay }) {
  const share = `https://wa.me/?text=${encodeURIComponent(`I'm staying at ${hotel.name}, ${formatDate(stay.checkIn)} to ${formatDate(stay.checkOut)}. ${stay.siteUrl}`)}`;
  const rows: Array<[string, string]> = [
    ["Room", `${stay.room ? `${stay.room} · ` : ""}${stay.category}`],
    ["Guests", String(stay.guests)],
    ["Check-in", `${formatDate(stay.checkIn)}, from ${stay.checkInTime}`],
    ["Check-out", `${formatDate(stay.checkOut)}, by ${stay.checkOutTime}`],
    ["Paid", `${formatNaira(stay.paidKobo)} · ${plural(stay.nights, "night")}`],
  ];
  const contact = "inline-flex min-h-11 items-center gap-1.5 font-medium text-navy-800 hover:text-gold-600";
  return (
    <div className="mx-auto max-w-[37.5rem] text-center">
      <span className="mx-auto flex size-13 items-center justify-center rounded-full bg-success-50 text-success-600"><Check className="size-6" strokeWidth={3} aria-hidden /></span>
      <h1 className="mt-[18px] font-display text-[2.25rem] leading-[1.05] font-medium text-navy-950 sm:text-[2.75rem]">You&apos;re booked, {stay.guestName.split(" ")[0]}</h1>
      <p className="mt-2 text-[15px] text-ink-600">
        Payment received and your reservation is confirmed.{stay.email ? <> Details sent to <span className="font-medium text-ink-900 [overflow-wrap:anywhere]">{stay.email}</span>.</> : null}
      </p>

      <div className="mt-7 overflow-hidden rounded-card border border-hairline bg-white text-left">
        <div className="flex items-center justify-between gap-3 bg-navy-950 py-2.5 pr-2.5 pl-5 text-ivory-50">
          <span className="text-[11px] tracking-[0.2em] text-gold-300 uppercase">Booking reference</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[17px] tracking-[0.06em]">{stay.reference}</span>
            <span className="[&_button]:text-ivory-50"><CopyButton text={stay.reference} /></span>
          </span>
        </div>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 p-5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-500">{k}</dt>
              <dd className="mt-0.5 font-medium text-ink-900 tabular-nums">{v}</dd>
            </div>
          ))}
          {stay.receiptNumber ? (
            <div>
              <dt className="text-ink-500">Receipt</dt>
              <dd className="mt-0.5 font-medium"><Link href={`/book/receipt/${stay.token}/${stay.receiptNumber}`} className="text-navy-800 underline underline-offset-2">{stay.receiptNumber}</Link></dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-x-6 border-t border-hairline bg-ivory-50 px-5 py-1.5 text-sm">
          <a href={hotel.mapsUrl} target="_blank" rel="noreferrer" className={contact}><MapPin className="size-4" aria-hidden />Directions</a>
          <a href={`tel:${hotel.phone}`} className={contact}><Phone className="size-4" aria-hidden />Call the hotel</a>
          <a href={`https://wa.me/${hotel.whatsapp}`} className={contact}><MessageCircle className="size-4" aria-hidden />WhatsApp</a>
          <a href={`/book/confirmation/${stay.token}/calendar`} className={contact}><CalendarPlus className="size-4" aria-hidden />Calendar</a>
          <a href={share} target="_blank" rel="noreferrer" className={contact}><Share2 className="size-4" aria-hidden />Share</a>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-600">
        Arrive from {stay.checkInTime}. Need to change dates or cancel? <Link href="/account" className="text-navy-800 underline underline-offset-2">Manage your booking</Link>
      </p>
      <Link href="/" className={buttonStyles({ variant: "secondary", className: "mt-6" })}>Back to the website</Link>
    </div>
  );
}

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
