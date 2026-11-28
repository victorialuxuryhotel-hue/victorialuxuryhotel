import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { WalkIn } from "@/components/management/walk-in";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { addDays, tonight } from "@/lib/hotel-date";
import { actorOf, requireStaff } from "@/server/auth";
import { all, first, getDb } from "@/server/db";
import { paymentSettings } from "@/server/domain/payment-details";
import { availabilityForStay } from "@/server/domain/staff-booking";

export const metadata: Metadata = { title: "Walk-in" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "reservations.manage")) return <AccessDenied />;
  const db = await getDb();
  const night = tonight();
  const [types, pay, hold, initial] = await Promise.all([
    all<{ id: string; name: string; rateKobo: number; maxOccupancy: number }>(
      db,
      "SELECT id, name, nightly_rate_kobo AS rateKobo, max_occupancy AS maxOccupancy FROM room_categories WHERE is_active = 1 ORDER BY sort_order, nightly_rate_kobo",
    ),
    paymentSettings(db),
    first<{ h: number }>(db, "SELECT walkin_hold_hours AS h FROM hotel_settings WHERE id = 1"),
    availabilityForStay(db, actorOf(staff), night, addDays(night, 1)),
  ]);
  return <WalkIn types={types} tonight={night} holdHours={hold?.h ?? 6} pay={pay} initial={initial} />;
}

export default function WalkInPage() {
  return (
    <>
      <PageHeader title="Walk-in" description="One screen from guest to checked in." />
      <div className="px-4 py-6 lg:px-8">
        <Suspense fallback={<LoadingState />}><Content /></Suspense>
      </div>
    </>
  );
}
