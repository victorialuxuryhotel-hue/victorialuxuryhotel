import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AccessDenied } from "@/components/management/access-denied";
import { CategoryForm } from "@/components/management/category-form";
import { CategoryPhotoManager } from "@/components/management/photo-manager";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/management/page-header";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { getCategory } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Edit category" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "categories.manage")) return <AccessDenied />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await getCategory(id);
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`Edit ${c.name}`} description="Rate changes apply to new bookings only." />
      <CategoryForm category={c} />
      <div className="px-4 pb-8 lg:px-8">
        <Card>
          <CardHeader title="Photos" description="Shown on the website. The cover appears on room cards; all photos appear on the room's page and in the gallery." />
          <div className="p-5"><CategoryPhotoManager categoryId={c.id} photos={c.photos} /></div>
        </Card>
      </div>
    </>
  );
}

export default function EditCategoryPage(props: PageProps<"/app/rooms/categories/[id]">) {
  return <Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense>;
}
