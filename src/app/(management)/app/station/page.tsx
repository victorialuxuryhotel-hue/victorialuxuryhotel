import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { StationSettingsForm } from "@/components/management/station-settings";
import { RevokeStationButton, StationSetupForm } from "@/components/management/station-setup";
import { LoadingState } from "@/components/ui/feedback";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { actorOf, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db";
import { listStations, STATION_TYPES } from "@/server/domain/stations";

export const metadata: Metadata = { title: "This station" };

export default function StationPage() {
  return (
    <>
      <PageHeader title="This station" description="Settings for this computer only." />
      <div className="space-y-8 px-4 py-6 lg:px-8">
        <StationSettingsForm />
        <Suspense fallback={<LoadingState />}>
          <Stations />
        </Suspense>
      </div>
    </>
  );
}

async function Stations() {
  const staff = await requireStaff();
  if (staff.station) {
    return (
      <section className="max-w-2xl rounded-card border border-hairline bg-white p-5">
        <h2 className="text-lg font-semibold text-ink-900">Shared station</h2>
        <p className="mt-1 text-sm text-ink-600">
          This computer is <strong className="font-medium text-ink-900">{staff.station.name}</strong> ({STATION_TYPES[staff.station.type]}). Staff sign in with their name and PIN. Only the owner can revoke it.
        </p>
      </section>
    );
  }
  if (!can(staff.role, "stations.manage")) return null;
  const stations = await listStations(await getDb(), actorOf(staff));
  const owner = can(staff.role, "staff.manage");
  return (
    <>
      <section className="max-w-2xl rounded-card border border-hairline bg-white p-5">
        <h2 className="text-lg font-semibold text-ink-900">Set up this computer as a shared station</h2>
        <p className="mt-1 mb-4 text-sm text-ink-600">For the front desk and the till. Staff then sign in with their name and PIN, and everything they do carries their name.</p>
        <StationSetupForm />
      </section>
      {stations.length ? (
        <section className="max-w-3xl">
          <h2 className="text-lg font-semibold text-ink-900">Stations</h2>
          <div className="mt-3 overflow-x-auto rounded-card border border-hairline bg-white">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-ink-500">
                <tr><th className="px-4 py-2.5 font-medium">Station</th><th className="px-4 py-2.5 font-medium">Signed in now</th><th className="px-4 py-2.5 font-medium">Set up</th><th className="px-4 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {stations.map((s) => (
                  <tr key={s.id} className={s.revoked_at ? "text-ink-500" : undefined}>
                    <td className="px-4 py-3"><span className="font-medium text-ink-900">{s.name}</span> · {STATION_TYPES[s.type]}</td>
                    <td className="px-4 py-3">{s.revoked_at ? `Revoked ${formatDateTime(s.revoked_at)}` : (s.signed_in ?? "Locked")}</td>
                    <td className="px-4 py-3">{formatDateTime(s.created_at)}{s.created_by_name ? ` · ${s.created_by_name}` : ""}</td>
                    <td className="px-4 py-3 text-right">{owner && !s.revoked_at ? <RevokeStationButton id={s.id} name={s.name} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
