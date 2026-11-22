import { ArrowUpRight, MapPin } from "lucide-react";
import { hotel } from "@/config/hotel";
import { cn } from "@/lib/utils/cn";

const address = `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`;

/** A drawn street-map motif with a pin: a visual cue, not a real map. */
export function MapMotif({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-36 overflow-hidden bg-ivory-100", className)}>
      <svg className="absolute inset-0 size-full text-ivory-200" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 150" fill="none" stroke="currentColor">
        <path d="M-10 40 C80 60 140 20 230 45 S360 70 420 50" strokeWidth="10" />
        <path d="M-10 115 C90 100 170 130 260 110 S370 95 420 105" strokeWidth="6" />
        <path d="M120 -10 C130 50 110 100 140 160" strokeWidth="6" />
        <path d="M300 -10 C285 40 320 90 300 160" strokeWidth="4" />
        <path d="M40 -10 L60 160 M200 -10 L215 160 M360 -10 L350 160" strokeWidth="2" />
      </svg>
      <span className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-[70%] items-center justify-center rounded-full bg-navy-900 text-gold-300 shadow-card ring-4 ring-white">
        <MapPin className="size-5" />
      </span>
    </div>
  );
}

/**
 * Where the hotel is. Phones and tablets get a still card that opens the
 * maps app: an embedded map there catches the finger and stops the page
 * scrolling. Large screens get the interactive embed.
 */
export function MapCard({ className, embedClassName }: { className?: string; embedClassName?: string }) {
  return (
    <>
      <a
        href={hotel.mapsUrl}
        className={cn("group block overflow-hidden rounded-card border border-hairline bg-ivory-50 lg:hidden", className)}
        aria-label={`Open ${hotel.name} in Maps: ${address}`}
      >
        <MapMotif />
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <span>
            <span className="block font-display text-xl text-navy-950">Alagbaka GRA, Akure</span>
            <span className="mt-0.5 block text-sm text-ink-500">Tap to open in Maps</span>
          </span>
          <ArrowUpRight className="size-5 shrink-0 text-gold-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </div>
      </a>
      <MapEmbed className={embedClassName} />
    </>
  );
}

/** The interactive map, large screens only (on phones it would catch the scroll). */
export function MapEmbed({ className }: { className?: string }) {
  return (
    <iframe
      title={`Map showing ${hotel.name}`}
      src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
      className={cn("hidden w-full border-0 lg:block", className)}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
