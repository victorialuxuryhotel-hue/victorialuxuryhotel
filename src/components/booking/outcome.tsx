import Link from "next/link";
import { Clock } from "lucide-react";
import { CopyButton } from "./copy-button";
import { Photo } from "@/components/public/photo";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { bookingShareText, whatsappShareLink } from "@/lib/booking-share";
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
  /** The room type's cover photo (design G7). */
  photo?: { image: string; alt: string };
};

export function BookingConfirmed({ stay }: { stay: ConfirmedStay }) {
  const share = whatsappShareLink(
    bookingShareText({ hotelName: hotel.name, reference: stay.reference, checkIn: stay.checkIn, checkOut: stay.checkOut, checkInTime: stay.checkInTime, checkOutTime: stay.checkOutTime, siteUrl: stay.siteUrl }),
  );
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${stay.checkIn}T12:00:00Z`));
  const first = stay.guestName.split(" ")[0];
  const room = `${stay.room ? `${stay.room} · ` : ""}${stay.category} · ${plural(stay.guests, "guest")}`;
  const facts: Array<[string, string]> = [
    ["Arrive", `${formatDate(stay.checkIn, { year: false })} · ${stay.checkInTime}`],
    ["Leave", `${formatDate(stay.checkOut, { year: false })} · ${stay.checkOutTime}`],
    ["Room", room],
    ["Paid", `${formatNaira(stay.paidKobo)} · ${plural(stay.nights, "night")}`],
    ["Address", `${hotel.address.line1.replace(/^.*Plot \d+, /, "")}, ${hotel.address.city}`],
  ];
  const receipt = stay.receiptNumber ? `/book/receipt/${stay.token}/${stay.receiptNumber}` : null;
  const calendar = `/book/confirmation/${stay.token}/calendar`;
  return (
    <div className="mx-auto w-full max-w-[760px] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-hairline">
      <Photo photo={stay.photo ?? { alt: stay.category }} className="-mx-4 h-[180px] lg:mx-0 lg:h-[200px]" sizes="(min-width: 1024px) 760px, 100vw" />
      <div className="flex flex-col gap-4 pt-5 max-lg:items-center max-lg:text-center lg:p-7">
        <Badge tone="success">Paid · confirmed</Badge>
        <h1 className="font-display text-[30px] leading-tight font-semibold text-ink-900 lg:text-[42px]">See you on {weekday}, {first}</h1>
        <p className="text-[15px] text-muted lg:text-base">
          <span className="max-lg:hidden">Your booking reference is <b className="text-ink-900">{stay.reference}</b>. </span>
          {stay.email ? <>We&apos;ve emailed your confirmation and receipt to <span className="[overflow-wrap:anywhere]">{stay.email}</span>.</> : "Your confirmation and receipt are below."}
        </p>

        <dl className="hidden grid-cols-3 gap-3.5 rounded-xl bg-ivory-100 p-4 tabular-nums lg:grid">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold text-muted">{k}</dt>
              <dd className="mt-1 text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-semibold text-muted">Reference</dt>
            <dd className="-my-1.5 flex items-center gap-1 text-[15px] font-semibold">{stay.reference}<CopyButton text={stay.reference} className="min-h-8 px-2" /></dd>
          </div>
        </dl>
        <dl className="flex w-full flex-col gap-2.5 rounded-xl border border-hairline p-4 text-left text-sm tabular-nums lg:hidden">
          {[["Reference", stay.reference] as [string, string], ...facts.slice(0, 4)].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid w-full grid-cols-3 gap-2.5 lg:flex lg:flex-wrap">
          {receipt ? <Link href={receipt} className={buttonStyles({ className: "col-span-3 max-lg:h-15 max-lg:w-full max-lg:text-lg" })}>Download receipt</Link> : null}
          <a href={share} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", className: "max-lg:w-full max-lg:px-2" })}>
            <span className="lg:hidden">WhatsApp</span><span className="max-lg:hidden">Send to WhatsApp</span>
          </a>
          <a href={calendar} className={buttonStyles({ variant: "secondary", className: "max-lg:w-full max-lg:px-2" })}>
            <span className="lg:hidden">Calendar</span><span className="max-lg:hidden">Add to calendar</span>
          </a>
          <a href={hotel.mapsUrl} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", className: "max-lg:w-full max-lg:px-2" })}>Directions</a>
        </div>
        <p className="text-sm text-muted">
          Need to change dates or cancel? <Link href="/account" className="inline-flex min-h-11 items-center font-semibold text-navy-700 underline-offset-2 hover:underline">Manage your booking</Link>
          {" · "}
          <a href={`tel:${hotel.phone}`} className="inline-flex min-h-11 items-center font-semibold text-navy-700 underline-offset-2 hover:underline">Call the hotel</a>
        </p>
      </div>
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

/** Payment didn't go through (designs G8, M9). The room stays held; the guest can try again or pay another way. */
export function PaymentFailed({ retryHref, category, holdUntil }: { retryHref: string; category?: string; holdUntil?: string }) {
  const until = holdUntil ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: hotel.timezone }).format(new Date(holdUntil)) : null;
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3.5 text-center lg:items-start lg:rounded-2xl lg:border lg:border-hairline lg:p-8 lg:text-left">
      <Badge tone="danger">Payment didn&apos;t go through</Badge>
      <h1 className="font-display text-[30px] leading-tight font-semibold text-ink-900 lg:text-[34px]">Your card wasn&apos;t charged</h1>
      <p className="text-[15px] text-muted">
        The payment didn&apos;t go through, so your booking isn&apos;t confirmed yet.{" "}
        {until ? <>Your {category ? `${category} ` : ""}room is still held for you until <b className="text-ink-900 tabular-nums">{until}</b>.</> : "Your room is held for a short while if you'd like to try again."}
      </p>
      <Link href={retryHref} className={buttonStyles({ size: "lg", className: "mt-1 w-full" })}>Try paying again</Link>
      <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Pay another way</a>
      <p className="text-center text-xs text-muted lg:self-center">
        Paid by transfer and it&apos;s still processing? You don&apos;t need to pay twice. We&apos;ll email you as soon as it arrives.
      </p>
    </div>
  );
}
