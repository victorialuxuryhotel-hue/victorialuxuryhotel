import { CategoryTable } from "@/components/management/categories";
import { PageHeader } from "@/components/management/page-header";
import { Button } from "@/components/ui/button";
import { categories } from "../../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Room categories" description="What guests book on the website: names, rates, photos and capacity." actions={<Button>Add category</Button>} />
      <div className="px-4 py-6 lg:px-8"><CategoryTable rows={categories} hrefFor={() => "/preview/app/rooms/categories/standard"} /></div>
    </>
  );
}
