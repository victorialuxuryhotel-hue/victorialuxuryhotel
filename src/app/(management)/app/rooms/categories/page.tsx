import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { CategoryTable } from "@/components/management/categories";
import { PageHeader } from "@/components/management/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { listCategories } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Room categories" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "categories.manage")) return <AccessDenied />;
  return <Card><CategoryTable rows={await listCategories()} hrefFor={(c) => `/app/rooms/categories/${c.id}`} /></Card>;
}

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Room categories"
        description="What guests book on the website: names, rates, capacity and visibility."
        actions={<Link href="/app/rooms/categories/new" className={buttonStyles()}>Add category</Link>}
      />
      <div className="px-4 py-6 lg:px-8"><Suspense fallback={<LoadingState />}><Content /></Suspense></div>
    </>
  );
}
