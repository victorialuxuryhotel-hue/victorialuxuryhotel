import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { MobileNav } from "./mobile-nav";

export const publicNav = [
  { href: "/rooms", label: "Rooms" },
  { href: "/facilities", label: "Facilities" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Contact strip above the header on larger screens. */
function UtilityBar() {
  return (
    <div className="hidden bg-navy-950 text-xs text-ivory-200/80 md:block">
      <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-6">
        <a href={hotel.mapsUrl} className="flex items-center gap-2 hover:text-gold-300">
          <MapPin className="size-3.5 text-gold-400" aria-hidden />
          {hotel.address.line1}, {hotel.address.city}
        </a>
        <div className="flex items-center gap-6">
          <a href={`tel:${hotel.phone}`} className="flex items-center gap-2 hover:text-gold-300">
            <Phone className="size-3.5 text-gold-400" aria-hidden /> {hotel.phoneDisplay}
          </a>
          <a href={`https://wa.me/${hotel.whatsapp}`} className="flex items-center gap-2 hover:text-gold-300">
            <MessageCircle className="size-3.5 text-gold-400" aria-hidden /> WhatsApp
          </a>
          <a href={`mailto:${hotel.email}`} className="hidden items-center gap-2 hover:text-gold-300 lg:flex">
            <Mail className="size-3.5 text-gold-400" aria-hidden /> {hotel.email}
          </a>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  return (
    <>
      <UtilityBar />
      <header className="sticky top-0 z-40 border-b border-hairline bg-ivory-50/95 backdrop-blur supports-[backdrop-filter]:bg-ivory-50/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 md:h-20">
          <Link href="/" className="flex items-center gap-3" aria-label={`${hotel.name}, home`}>
            <Logo className="w-9 md:w-11" priority />
            <span className="leading-none">
              <span className="block font-display text-xl font-semibold tracking-wide text-navy-950 md:text-2xl">Victoria Luxury</span>
              {/* Phones: the name alone, so it never crowds the menu button. */}
              <span className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.3em] text-gold-600 sm:block">Hotel &amp; Apartment</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-8 text-sm font-medium text-ink-700 md:flex">
            {publicNav.map((item) => (
              <Link key={item.href} href={item.href} className="relative py-2 transition-colors hover:text-navy-800 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-gold-500 after:transition-transform hover:after:scale-x-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block">
              <Link href="/book" className={buttonStyles({ size: "md" })}>
                Book now
              </Link>
            </span>
            <MobileNav items={publicNav} />
          </div>
        </div>
      </header>
    </>
  );
}
