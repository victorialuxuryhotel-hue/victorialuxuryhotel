import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { hotel } from "@/config/hotel";
import { publicNav } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy-950 text-ivory-100">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-11 pb-7 sm:px-5 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Logo className="w-[34px]" />
            <span className="leading-none">
              <span className="block font-display text-2xl text-ivory-50">Victoria Luxury</span>
              <span className="mt-1 block text-xs uppercase tracking-[0.3em] text-gold-300">Hotel &amp; Apartment</span>
            </span>
          </div>
          <p className="mt-3.5 max-w-sm text-[13px] leading-relaxed text-ivory-200/70">
            Where every guest is treated as royalty. Rooms, suites and apartments in Alagbaka GRA, Akure.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">Explore</p>
          <ul className="mt-5 space-y-3 text-sm text-ivory-200/80">
            {publicNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-gold-300">{item.label}</Link>
              </li>
            ))}
            <li><Link href="/book" className="hover:text-gold-300">Book your stay</Link></li>
            <li><Link href="/account" className="hover:text-gold-300">My bookings</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">Contact</p>
          <ul className="mt-5 space-y-4 text-sm text-ivory-200/80">
            <li>
              <a href={hotel.mapsUrl} className="flex gap-3 hover:text-gold-300">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold-400" aria-hidden />
                <span>{hotel.address.line1}<br />{hotel.address.city}, {hotel.address.state}</span>
              </a>
            </li>
            <li>
              <a href={`tel:${hotel.phone}`} className="flex gap-3 hover:text-gold-300">
                <Phone className="size-4 shrink-0 text-gold-400" aria-hidden /> {hotel.phoneDisplay}
              </a>
            </li>
            <li>
              <a href={`https://wa.me/${hotel.whatsapp}`} className="flex gap-3 hover:text-gold-300">
                <MessageCircle className="size-4 shrink-0 text-gold-400" aria-hidden /> WhatsApp us
              </a>
            </li>
            <li>
              <a href={`mailto:${hotel.email}`} className="flex gap-3 break-all hover:text-gold-300">
                <Mail className="size-4 shrink-0 text-gold-400" aria-hidden /> {hotel.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-ivory-200/50 sm:flex-row sm:justify-between sm:px-6">
          <p>© {hotel.name}</p>
        </div>
      </div>
    </footer>
  );
}
