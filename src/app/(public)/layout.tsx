import { Suspense } from "react";
import { HotelSchema } from "@/components/public/hotel-schema";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { StickyBookBar } from "@/components/public/sticky-book-bar";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="contents print:hidden"><SiteHeader /></div>
      <main className="flex flex-1 flex-col">{children}</main>
      <div className="contents print:hidden"><SiteFooter /></div>
      {/* Reads the URL, so it renders at request time inside its own boundary. */}
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
