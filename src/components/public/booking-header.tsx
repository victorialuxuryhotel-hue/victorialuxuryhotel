import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { hotel } from "@/config/hotel";

export function BookingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-white">
      <div className="mx-auto flex h-15 max-w-[65rem] items-center justify-between gap-3 px-4 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${hotel.name}, home`}>
          <Logo className="w-7" priority />
          <span className="font-display text-[19px] font-semibold text-navy-950">Victoria Luxury</span>
        </Link>
        <a href={`tel:${hotel.phone}`} className="flex min-h-11 items-center text-right text-[13px] text-ink-600">
          <span>
            <span className="max-sm:sr-only">Need help? </span>
            <span className="font-medium text-navy-800">{hotel.phoneDisplay}</span>
          </span>
        </a>
      </div>
    </header>
  );
}
