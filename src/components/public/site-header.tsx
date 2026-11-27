import Link from "next/link";
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

export function SiteHeader() {
  return (
      <header className="sticky top-0 z-40 border-b border-hairline bg-ivory-50/95 backdrop-blur supports-[backdrop-filter]:bg-ivory-50/85">
        <div className="mx-auto flex h-17 max-w-6xl items-center justify-between gap-4 px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-3" aria-label={`${hotel.name}, home`}>
            <Logo className="w-[34px]" priority />
            <span className="leading-none">
              <span className="block font-display text-[21px] font-semibold text-navy-950">Victoria Luxury</span>
              <span className="mt-0.5 hidden text-[9px] font-medium whitespace-nowrap uppercase tracking-[0.3em] text-gold-600 sm:block">Hotel &amp; Apartment</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm font-medium text-ink-700 md:flex">
            {publicNav.map((item) => (
              <Link key={item.href} href={item.href} className="relative py-2 transition-colors hover:text-navy-800 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-gold-500 after:transition-transform hover:after:scale-x-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a href={`tel:${hotel.phone}`} className="hidden text-[13px] whitespace-nowrap text-ink-600 hover:text-navy-800 lg:block">
              {hotel.phoneDisplay}
            </a>
            <span className="hidden sm:block">
              <Link href="/book" className={buttonStyles({ size: "md" })}>
                Book now
              </Link>
            </span>
            <MobileNav items={publicNav} />
          </div>
        </div>
      </header>
  );
}
