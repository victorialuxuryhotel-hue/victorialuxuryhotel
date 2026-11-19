import { GuestTable } from "@/components/management/guests";
import { PageHeader } from "@/components/management/page-header";
import { ListToolbar } from "@/components/management/toolbar";
import { Card } from "@/components/ui/card";
import { guests } from "../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Guests" description="Contact details and booking history." />
      <div className="px-4 py-6 lg:px-8">
        <Card>
          <ListToolbar placeholder="Search by name, email or phone" />
          <GuestTable rows={guests} hrefFor={() => "/preview/app/guests/g1"} />
        </Card>
      </div>
    </>
  );
}
