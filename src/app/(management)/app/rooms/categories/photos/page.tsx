import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { RatesTabs } from "@/components/management/rates-tabs";
import { GalleryManager, SitePhotoSlot } from "@/components/management/photo-manager";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { CARD_PHOTOS, galleryGroups, isCardSlot, photoSlots } from "@/content/photo-slots";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { listSitePhotos } from "@/server/queries/site-photos";

export const metadata: Metadata = { title: "Website photos" };

async function Content() {
  const staff = await requireStaff();
  if (!can(staff.role, "categories.manage")) return <AccessDenied />;
  const { bySlot, gallery } = await listSitePhotos();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Photo places"
          description="One photo for each place on the website. The homepage On site cards (pool, lounge, restaurant, club) take up to 4 each, shown together."
        />
        {photoSlots.map((s) => (
          <SitePhotoSlot key={s.slot} slot={s.slot} label={s.label} where={s.where} shape={s.shape} shot={s.shot} photos={bySlot[s.slot] ?? []} max={isCardSlot(s.slot) ? CARD_PHOTOS : 1} />
        ))}
      </Card>
      <Card>
        <CardHeader title="Gallery" description="Extra photos for the Gallery page." />
        <GalleryManager photos={gallery} groups={galleryGroups} />
      </Card>
      <p className="text-sm text-ink-500">
        Room photos are managed on each room type: <Link href="/app/rooms/categories" className="font-medium text-navy-800 underline">Rates &amp; room types</Link>.
      </p>
    </div>
  );
}

export default function WebsitePhotosPage() {
  return (
    <>
      <PageHeader title="Rates & room types" description="Photos for the homepage, facilities, about and gallery pages." />
      <RatesTabs current="photos" />
      <div className="px-4 py-6 lg:px-8">
        <Suspense fallback={<LoadingState />}><Content /></Suspense>
      </div>
    </>
  );
}
