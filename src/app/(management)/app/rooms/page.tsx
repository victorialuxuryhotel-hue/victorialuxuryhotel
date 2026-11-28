import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AddRoomForm } from "@/components/management/add-room-form";
import { PageHeader } from "@/components/management/page-header";
import { RoomBoard, RoomStateChips } from "@/components/management/room-board";
import { RoomFinder } from "@/components/management/room-finder";
import { roomBoardState, type RoomBoardState } from "@/domain/status";
import { Section } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can, canAny } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { listCategories, roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Rooms" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, "rooms.status")) return <AccessDenied />;
  const requested = (await searchParams).state;
  const active = typeof requested === "string" && requested in roomBoardState ? (requested as RoomBoardState) : undefined;
  const configure = can(staff.role, "rooms.configure");
  const [rooms, categories] = await Promise.all([roomBoard(), configure ? listCategories() : Promise.resolve([])]);
  return (
    <div className="space-y-3.5">
      <RoomStateChips rooms={rooms} active={active} hrefFor={(s) => (s ? `/app/rooms?state=${s}` : "/app/rooms")} />
      {rooms.length ? (
        <RoomBoard rooms={active ? rooms.filter((r) => r.state === active) : rooms} />
      ) : (
        <Section title="Rooms"><div className="p-5"><EmptyState title="No rooms yet" description="Add rooms below, or ask a manager to." /></div></Section>
      )}
      <p className="text-[13px] text-[#5b6372]">Tap a room to update cleaning status or mark it out of order.</p>
      {configure ? (
        <Section title="Add a room">
          <p className="px-4 pt-3 text-sm text-[#5b6372]">New rooms can be booked straight away under their room type.</p>
          <AddRoomForm categories={categories} />
        </Section>
      ) : null}
    </div>
  );
}

export default function RoomsPage(props: PageProps<"/app/rooms">) {
  return (
    <>
      <PageHeader title="Rooms" description="What every room is doing right now" actions={<RoomFinder />} />
      <div className="px-4 py-5 lg:px-7"><Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense></div>
    </>
  );
}
