import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddRoomForm } from "@/components/management/add-room-form";
import { PageHeader } from "@/components/management/page-header";
import { RoomBoard, RoomStateChips } from "@/components/management/room-board";
import { roomBoardState, type RoomBoardState } from "@/domain/status";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
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
    <div className="space-y-6">
      <Card>
        <div className="border-b border-hairline px-4 py-3 sm:px-5">
          <RoomStateChips rooms={rooms} active={active} hrefFor={(s) => (s ? `/app/rooms?state=${s}` : "/app/rooms")} />
        </div>
        <div className="p-4 sm:p-5">
          {rooms.length ? (
            <RoomBoard rooms={active ? rooms.filter((r) => r.state === active) : rooms} />
          ) : (
            <EmptyState title="No rooms yet" description="Add rooms below, or ask a manager to." />
          )}
        </div>
        <p className="border-t border-hairline px-5 py-3 text-xs text-ink-500">Tap a room to update cleaning status or mark it under maintenance.</p>
      </Card>
      {configure ? (
        <Card>
          <CardHeader title="Add a room" description="New rooms are bookable straight away in their category." />
          <AddRoomForm categories={categories} />
        </Card>
      ) : null}
    </div>
  );
}

export default function RoomsPage(props: PageProps<"/app/rooms">) {
  return (
    <>
      <PageHeader
        title="Rooms"
        description="Live status, readiness and maintenance."
        actions={<Link href="/app/rooms/categories" className={buttonStyles({ variant: "secondary" })}>Categories & rates</Link>}
      />
      <div className="px-4 py-6 lg:px-8"><Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense></div>
    </>
  );
}
