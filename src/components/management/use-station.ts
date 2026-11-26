"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseStation, readStationRaw, subscribeStation, type StationSettings } from "@/lib/station";

/** This computer's station settings (A4 / no auto-print until the page has loaded in the browser). */
export function useStation(): StationSettings {
  const raw = useSyncExternalStore(subscribeStation, readStationRaw, () => null);
  return useMemo(() => parseStation(raw), [raw]);
}
