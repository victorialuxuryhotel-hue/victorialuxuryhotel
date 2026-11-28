import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { auth } from "@clerk/nextjs/server";
import { AccessDenied, SignInPanel } from "./sign-in-panel";
import { BrowserBanner } from "@/components/management/browser-check";
import { Photo } from "@/components/public/photo";
import { sitePhoto } from "@/components/public/site-photo";
import { home } from "@/content/site";
import { getSitePhotos } from "@/server/queries/catalogue";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

async function FormWithNext({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.denied && (await auth()).userId) return <AccessDenied />;
  return <SignInPanel next={typeof params.next === "string" ? params.next : undefined} />;
}

async function LoginPhoto() {
  const photos = await getSitePhotos();
  return <Photo photo={sitePhoto(photos, "hero", home.hero)} tone="dark" sizes="60vw" className="absolute inset-0" />;
}

/** Staff sign-in (design S1): the hotel photo with the wordmark, and the sign-in panel. */
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <>
      <BrowserBanner />
      <main className="flex min-h-screen flex-1">
        <div className="relative hidden flex-1 overflow-hidden bg-navy-950 lg:block">
          <Suspense fallback={null}><LoginPhoto /></Suspense>
          <div aria-hidden className="absolute inset-0 bg-[rgba(1,18,72,.55)]" />
          <div className="absolute bottom-14 left-14">
            <p className="font-brand text-[44px] text-white">Victoria Luxury</p>
            <p className="mt-1 text-xs font-semibold tracking-[0.2em] text-[#f4d88c]">MANAGEMENT</p>
          </div>
        </div>
        <div className="flex w-full flex-col justify-center bg-white px-6 py-12 sm:px-16 lg:w-[520px]">
          <div className="mx-auto w-full max-w-sm space-y-[18px] lg:mx-0">
            <Logo className="w-14 lg:hidden" />
            <h1 className="text-[28px] font-bold text-ink-900">Sign in</h1>
            <p className="text-[15px] text-ink-600">For managers, and to set up a counter or desk computer.</p>
            <Suspense fallback={<div className="h-56" />}>
              <FormWithNext searchParams={props.searchParams} />
            </Suspense>
            <p className="pt-2 text-center text-[13px] text-ink-600">Staff on a shared counter: tap your name on the counter screen and use your PIN.</p>
            <p className="text-center">
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-navy-800">
                <ArrowLeft className="size-4" aria-hidden /> Back to the website
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
