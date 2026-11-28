import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentStaff, getStation } from "@/server/auth";
import { getDb } from "@/server/db";
import { roster } from "@/server/domain/stations";
import { StationPage } from "./station-page";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

async function Grid({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const station = await getStation();
  if (!station) redirect("/login");
  const next = (await searchParams).next;
  const to = typeof next === "string" && next.startsWith("/app") ? next : "/app";
  if ((await getCurrentStaff())?.station) redirect(to);
  const people = await roster(await getDb(), station);
  return <StationPage stationName={station.name} roster={people.map((p) => ({ id: p.id, fullName: p.fullName, hasPin: p.hasPin, lockedMinutes: p.lockedMinutes }))} next={to} />;
}

export default function Page(props: PageProps<"/station">) {
  return (
    <main className="flex min-h-screen flex-1 bg-navy-950">
      <Suspense fallback={null}>
        <Grid searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
