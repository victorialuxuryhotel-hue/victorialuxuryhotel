import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";

export default function PreviewBookLayout({ children }: LayoutProps<"/preview/book">) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col bg-ivory-50">{children}</main>
      <SiteFooter />
    </>
  );
}
