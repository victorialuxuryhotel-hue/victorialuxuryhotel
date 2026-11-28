import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { CategoryTable } from "@/components/management/categories";
import { PageHeader } from "@/components/management/page-header";
import { RatesTabs } from "@/components/management/rates-tabs";
import { buttonStyles } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { listCategories } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Rates & room types" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "categories.manage")) return <AccessDenied />;
  return (
    <div className="space-y-3">
      <CategoryTable rows={await listCategories()} hrefFor={(c) => `/app/rooms/categories/${c.id}`} />
      <p className="text-sm text-ink-600">A new price applies to new bookings. Bookings already made keep the price they were booked at.</p>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Rates & room types"
        description="Room names, prices and how many each sleeps"
        actions={<Link href="/app/rooms/categories/new" className={buttonStyles()}>Add room type</Link>}
      />
      <RatesTabs current="types" />
      <div className="px-4 py-4 lg:px-8"><Suspense fallback={<LoadingState />}><Content /></Suspense></div>
    </>
  );
}
