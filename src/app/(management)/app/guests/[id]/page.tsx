import { hotelToday } from "@/lib/hotel-date";
import { canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { GuestProfile } from "@/components/management/guests";
import { LoadingState } from "@/components/ui/feedback";
import { requireStaff } from "@/server/auth";
import { getGuest } from "@/server/queries/guests";

export const metadata: Metadata = { title: "Guest" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, "guests.manage")) return <AccessDenied />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await getGuest(id);
  if (!result) notFound();
  return <GuestProfile guest={result.guest} stays={result.stays} stayHref={(r) => `/app/reservations/${r.id}`} today={hotelToday()} />;
}

export default function GuestPage(props: PageProps<"/app/guests/[id]">) {
  return <Suspense fallback={<LoadingState />}><Content params={props.params} /></Suspense>;
}
