import { CategoryForm } from "@/components/management/category-form";
import { PageHeader } from "@/components/management/page-header";
import { categories } from "../../../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Edit Standard" description="Changes to the rate apply to new bookings only." />
      <CategoryForm category={{ ...categories[0]!, shortDescription: "", description: "", amenities: [], sortOrder: 1 }} />
    </>
  );
}
