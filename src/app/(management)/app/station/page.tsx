import type { Metadata } from "next";
import { PageHeader } from "@/components/management/page-header";
import { StationSettingsForm } from "@/components/management/station-settings";

export const metadata: Metadata = { title: "This station" };

export default function StationPage() {
  return (
    <>
      <PageHeader title="This station" description="How this computer prints and which counter the till opens on. Saved on this computer only." />
      <div className="px-4 py-6 lg:px-8">
        <StationSettingsForm />
      </div>
    </>
  );
}
