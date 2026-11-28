import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GuestSignIn, MyBookings } from "@/components/booking/guest-account";
import { Container } from "@/components/public/section";
import { buttonStyles } from "@/components/ui/button";
import { hotelToday } from "@/lib/hotel-date";
import { getDb } from "@/server/db";
import { guestBookings } from "@/server/domain/guest-account";
import { guestEmail, signOutGuest } from "@/server/guest-account";
import { coverPhotos } from "@/server/queries/catalogue";
import { cancellationRuleText } from "@/server/queries/booking";

export const metadata: Metadata = { title: "My bookings", robots: { index: false, follow: false } };

/** Designs G9 and M10 (signed in) and M11 (find your booking). */
async function Content() {
  await connection();
  const email = await guestEmail();
  if (!email) {
    return (
      <div className="flex max-w-[420px] flex-col gap-4">
        <h1 className="font-display text-[34px] leading-tight font-semibold text-ink-900 lg:text-[44px]">Find your booking</h1>
        <p className="-mt-1 text-[15px] text-muted">See, change or cancel your bookings. We&apos;ll email you a code to sign in. No password needed.</p>
        <GuestSignIn />
      </div>
    );
  }
  const db = await getDb();
  const [bookings, rule, covers] = await Promise.all([
    guestBookings(db, email),
    db.prepare("SELECT free_cancel_hours, late_cancel_fee_pct, check_in_time, cancellation_policy FROM hotel_settings WHERE id = 1").first<{ free_cancel_hours: number; late_cancel_fee_pct: number; check_in_time: string; cancellation_policy: string | null }>(),
    coverPhotos(db),
  ]);
  return (
    <div className="flex max-w-[1100px] flex-col gap-4 lg:gap-5">
      <div>
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 text-sm break-all text-muted"><span className="max-lg:hidden">Signed in as </span>{email}</p>
          <form action={signOutGuest}>
            <button type="submit" className={buttonStyles({ variant: "secondary", size: "sm", className: "max-lg:border-transparent max-lg:bg-transparent max-lg:text-navy-700" })}>Sign out</button>
          </form>
        </div>
        <h1 className="mt-1 font-display text-[34px] leading-tight font-semibold text-ink-900 lg:text-[44px]">Your bookings</h1>
      </div>
      <MyBookings bookings={bookings} today={hotelToday()} photos={Object.fromEntries(covers)} />
      {rule ? (
        <p className="rounded-xl bg-ivory-100 px-4 py-3.5 text-sm text-muted">
          {rule.cancellation_policy ?? cancellationRuleText(rule.free_cancel_hours, rule.late_cancel_fee_pct, rule.check_in_time)}
        </p>
      ) : null}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Container className="pt-6 pb-12 lg:pt-10 lg:pb-18">
      <Suspense fallback={<div className="h-64" />}>
        <Content />
      </Suspense>
    </Container>
  );
}
