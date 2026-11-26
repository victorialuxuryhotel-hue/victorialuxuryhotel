import { Suspense } from "react";
import { BookingHeader } from "@/components/public/booking-header";
import { ChromeSwitch } from "@/components/public/chrome-switch";
import { HotelSchema } from "@/components/public/hotel-schema";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { StickyBookBar } from "@/components/public/sticky-book-bar";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="contents print:hidden">
        <Suspense fallback={<SiteHeader />}>
          <ChromeSwitch site={<SiteHeader />} booking={<BookingHeader />} />
        </Suspense>
      </div>
      <main className="flex flex-1 flex-col">{children}</main>
      <div className="contents print:hidden">
        <Suspense fallback={null}>
          <ChromeSwitch site={<SiteFooter />} />
        </Suspense>
      </div>
      <div className="contents print:hidden">
        <Suspense fallback={null}>
          <StickyBookBar />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <HotelSchema />
      </Suspense>
    </>
  );
}
