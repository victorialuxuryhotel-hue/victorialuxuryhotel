import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddRoomForm } from "@/components/management/add-room-form";
import { PageHeader } from "@/components/management/page-header";
import { RoomBoard, RoomBoardLegend } from "@/components/management/room-board";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { listCategories, roomBoard } from "@/server/queries/rooms";

export const metadata: Metadata = { title: "Rooms" };

async function Content() {
  const staff = await requireStaff();
  const configure = can(staff.role, "rooms.configure");
  const [rooms, categories] = await Promise.all([roomBoard(), configure ? listCategories() : Promise.resolve([])]);
  return (
    <div className="space-y-6">
      <Card>
        <div className="border-b border-ivory-200 px-5 py-4"><RoomBoardLegend rooms={rooms} /></div>
        <div className="p-5">
          {rooms.length ? <RoomBoard rooms={rooms} /> : <EmptyState title="No rooms yet" description="Add rooms below, or ask a manager to." />}
        </div>
        <p className="border-t border-ivory-200 px-5 py-3 text-xs text-ink-500">Tap a room to update cleaning status or mark it under maintenance.</p>
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

export default function RoomsPage() {
  return (
    <>
      <PageHeader
        title="Rooms"
        description="Live status, readiness and maintenance."
        actions={<Link href="/app/rooms/categories" className={buttonStyles({ variant: "secondary" })}>Categories & rates</Link>}
      />
      <div className="px-4 py-6 lg:px-8"><Suspense fallback={<LoadingState />}><Content /></Suspense></div>
    </>
  );
}
