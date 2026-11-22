import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Design preview: every screen rendered with SAMPLE data, before its
 * functionality is connected. Disabled in production unless
 * ENABLE_DESIGN_PREVIEW=true (e.g. on a staging deployment for review).
 */
export default function PreviewLayout({ children }: LayoutProps<"/preview">) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DESIGN_PREVIEW !== "true") notFound();
  return (
    <>
      <div className="sticky top-0 z-[60] bg-gold-400 px-4 py-1.5 text-center text-xs font-medium text-navy-950">
        Design preview · sample data, not real bookings ·{" "}
        <a href="/preview" className="underline underline-offset-2">All screens</a>
      </div>
      {children}
    </>
  );
}
