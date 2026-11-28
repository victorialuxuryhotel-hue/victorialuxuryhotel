"use client";

import { useRouter } from "next/navigation";
import { StationSignIn, type RosterPerson } from "@/components/management/station-sign-in";

export function StationPage({ stationName, roster, next }: { stationName: string; roster: RosterPerson[]; next: string }) {
  const router = useRouter();
  return <StationSignIn stationName={stationName} roster={roster} onSignedIn={() => router.replace(next)} />;
}
