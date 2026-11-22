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
import { cancellationRuleText } from "@/server/queries/booking";

export const metadata: Metadata = { title: "My bookings", robots: { index: false, follow: false } };

async function Content() {
  await connection();
  const email = await guestEmail();
  if (!email) {
    return (
      <div className="max-w-sm">
        <h1 className="font-display text-4xl text-navy-950">My bookings</h1>
        <p className="mt-2 text-sm text-ink-600">See, change or cancel your bookings. We&apos;ll email you a code to sign in.</p>
        <div className="mt-8"><GuestSignIn /></div>
      </div>
    );
  }
  const db = await getDb();
  const [bookings, rule] = await Promise.all([
    guestBookings(db, email),
    db.prepare("SELECT free_cancel_hours, late_cancel_fee_pct FROM hotel_settings WHERE id = 1").first<{ free_cancel_hours: number; late_cancel_fee_pct: number }>(),
  ]);
  return (
    <div className="max-w-2xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-navy-950">My bookings</h1>
          <p className="mt-1 break-all text-sm text-ink-500">{email}</p>
        </div>
        <form action={signOutGuest}><button type="submit" className={buttonStyles({ variant: "ghost", size: "sm", className: "h-11" })}>Sign out</button></form>
      </div>
      {rule ? <p className="mt-4 text-sm text-ink-600">{cancellationRuleText(rule.free_cancel_hours, rule.late_cancel_fee_pct)}</p> : null}
      <div className="mt-6"><MyBookings bookings={bookings} today={hotelToday()} /></div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Container className="py-12 sm:py-20">
      <Suspense fallback={<div className="h-64" />}>
        <Content />
      </Suspense>
    </Container>
  );
}
