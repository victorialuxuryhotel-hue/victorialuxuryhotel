import { Suspense } from "react";
import { ChromeSwitch } from "@/components/public/chrome-switch";
import { guestFont } from "@/components/public/guest-font";
import { HotelSchema } from "@/components/public/hotel-schema";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { StickyBookBar } from "@/components/public/sticky-book-bar";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`guest ${guestFont.variable} flex flex-1 flex-col bg-white`}>
      <div className="contents print:hidden">
        <SiteHeader />
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
    </div>
  );
}
