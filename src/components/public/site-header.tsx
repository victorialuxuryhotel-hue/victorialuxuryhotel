import { Suspense } from "react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { MyBookingLink } from "./account-menu";
import { GuestMenu } from "./guest-menu";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

export const publicNav = [
  { href: "/rooms", label: "Rooms" },
  { href: "/facilities", label: "Facilities" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Design G1/M1: the wordmark, the pages, My booking (or the signed-in guest's menu, D4) and Book now. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-white">
      <div className="mx-auto flex h-16 max-w-360 items-center gap-10 px-4 lg:h-19 lg:px-16">
        <Link href="/" className="shrink-0 leading-none" aria-label={`${hotel.name}, home`}>
          <span className="block font-brand text-[22px] leading-none text-[#0b1f5c] lg:text-[26px]">Victoria Luxury</span>
          <span className="mt-0.5 hidden text-[10px] font-semibold tracking-[0.2em] whitespace-nowrap text-gold-500 lg:block">SUITES AND APARTMENT · AKURE</span>
        </Link>
        <Suspense fallback={<NavLinks items={publicNav} static />}>
          <NavLinks items={publicNav} />
        </Suspense>
        <span className="flex-1" />
        <div className="hidden items-center gap-6 lg:flex">
          <Suspense fallback={<MyBookingLink />}>
            <GuestMenu />
          </Suspense>
          <Link href="/book" className={buttonStyles()}>Book now</Link>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/book" className={buttonStyles({ size: "sm", className: "h-10" })}>Book</Link>
          <MobileNav items={publicNav} />
        </div>
      </div>
    </header>
  );
}
