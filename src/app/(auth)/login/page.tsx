import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { hotel } from "@/config/hotel";
import { auth } from "@clerk/nextjs/server";
import { AccessDenied, SignInPanel } from "./sign-in-panel";
import { BrowserBanner } from "@/components/management/browser-check";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

async function FormWithNext({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.denied && (await auth()).userId) return <AccessDenied />;
  return <SignInPanel next={typeof params.next === "string" ? params.next : undefined} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <>
    <BrowserBanner />
    <main className="grid min-h-screen flex-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(4_48_160/0.6),transparent_60%)]" />
        <div aria-hidden className="absolute -right-16 -bottom-32 font-display text-[28rem] leading-none text-gold-400/10 select-none">V</div>
        <Logo className="relative w-20" />
        <div className="relative">
          <p className="font-display text-5xl leading-tight text-ivory-50">Hotel management</p>
          <p className="mt-3 max-w-sm text-ivory-200/70">Bookings, rooms, guests and payments for {hotel.name}.</p>
        </div>
      </div>

      <div className="flex flex-col justify-center px-4 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="w-14 lg:hidden" />
          <h1 className="mt-6 font-display text-4xl text-navy-950 lg:mt-0">Staff sign-in</h1>
          <div className="mt-8">
            <Suspense fallback={<div className="h-56" />}>
              <FormWithNext searchParams={props.searchParams} />
            </Suspense>
          </div>
          <Link href="/" className="mt-10 inline-flex items-center gap-2 text-sm text-ink-500 hover:text-navy-800">
            <ArrowLeft className="size-4" aria-hidden /> Back to the website
          </Link>
        </div>
      </div>
    </main>
    </>
  );
}
