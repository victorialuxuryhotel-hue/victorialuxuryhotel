import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/management/access-denied";
import { PageHeader } from "@/components/management/page-header";
import { GalleryManager, SitePhotoSlot } from "@/components/management/photo-manager";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/feedback";
import { galleryGroups, photoSlots } from "@/content/photo-slots";
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
          description="Each place on the website, with the shot the photographer brief asks for. Until a photo is added, the website shows a branded placeholder."
        />
        {photoSlots.map((s) => (
          <SitePhotoSlot key={s.slot} slot={s.slot} label={s.label} where={s.where} shape={s.shape} shot={s.shot} photo={bySlot[s.slot]} />
        ))}
      </Card>
      <Card>
        <CardHeader title="Gallery" description="Extra photos for the Gallery page, by section. Room-type photos are added to the gallery automatically." />
        <GalleryManager photos={gallery} groups={galleryGroups} />
      </Card>
      <p className="text-sm text-ink-500">
        Room photos are managed on each room type: <Link href="/app/rooms/categories" className="font-medium text-navy-800 underline">Room categories</Link>.
      </p>
    </div>
  );
}

export default function WebsitePhotosPage() {
  return (
    <>
      <PageHeader title="Website photos" description="Photos for the homepage, facilities, about and gallery pages." />
      <div className="px-4 py-6 lg:px-8">
        <Link href="/app/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="size-4" aria-hidden /> Settings
        </Link>
        <Suspense fallback={<LoadingState />}><Content /></Suspense>
      </div>
    </>
  );
}
