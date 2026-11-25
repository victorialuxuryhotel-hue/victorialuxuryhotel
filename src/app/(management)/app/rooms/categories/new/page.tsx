import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { CategoryForm } from "@/components/management/category-form";
import { PageHeader } from "@/components/management/page-header";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "New room type" };

async function Content() {
  const staff = await requireStaff();
  return can(staff.role, "categories.manage") ? <CategoryForm /> : <AccessDenied />;
}

export default function NewCategoryPage() {
  return (
    <>
      <PageHeader title="New room type" />
      <Suspense fallback={<LoadingState />}><Content /></Suspense>
    </>
  );
}
