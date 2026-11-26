import Link from "next/link";
import { PageHeader } from "@/components/management/page-header";
import { RoomBoard, RoomStateChips } from "@/components/management/room-board";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { rooms } from "../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader
        title="Rooms"
        description="Live status, readiness and maintenance."
        actions={<Link href="/preview/app/rooms/categories" className={buttonStyles({ variant: "secondary" })}>Categories & rates</Link>}
      />
      <div className="px-4 py-6 lg:px-8">
        <Card>
          <div className="border-b border-hairline px-4 py-3 sm:px-5">
            <RoomStateChips rooms={rooms} hrefFor={() => "/preview/app/rooms"} />
          </div>
          <div className="p-4 sm:p-5"><RoomBoard rooms={rooms} /></div>
        </Card>
      </div>
    </>
  );
}
