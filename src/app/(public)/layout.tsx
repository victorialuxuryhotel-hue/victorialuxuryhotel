import { Suspense } from "react";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { StickyBookBar } from "@/components/public/sticky-book-bar";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      {/* Reads the URL, so it renders at request time inside its own boundary. */}
      <Suspense fallback={null}>
        <StickyBookBar />
      </Suspense>
    </>
  );
}
