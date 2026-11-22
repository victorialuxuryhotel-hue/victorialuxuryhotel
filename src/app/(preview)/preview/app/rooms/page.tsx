import Link from "next/link";
import { PageHeader } from "@/components/management/page-header";
import { RoomBoard, RoomBoardLegend, RoomStateChips } from "@/components/management/room-board";
import { FilterSelect, ListToolbar } from "@/components/management/toolbar";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roomBoardState } from "@/domain/status";
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
          <ListToolbar
            placeholder="Find a room number"
            filters={<><FilterSelect name="state" label="Status" options={Object.entries(roomBoardState).map(([k, v]) => [k, v.label])} /><FilterSelect name="category" label="Category" options={[["standard", "Standard"], ["deluxe", "Deluxe"], ["suite", "Suite"], ["apartment", "Apartment"]]} /></>}
          />
          <div className="border-b border-ivory-200 px-4 py-3 md:hidden">
            <RoomStateChips rooms={rooms} hrefFor={() => "/preview/app/rooms"} />
          </div>
          <div className="hidden border-b border-ivory-200 px-5 py-4 md:block"><RoomBoardLegend rooms={rooms} /></div>
          <div className="p-4 sm:p-5"><RoomBoard rooms={rooms} /></div>
        </Card>
      </div>
    </>
  );
}
