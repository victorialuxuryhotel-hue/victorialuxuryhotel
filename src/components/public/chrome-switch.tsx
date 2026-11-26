"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Choosing, detailing and paying for a room get a focused layout, so guests aren't led away mid-booking. */
const inBookingFlow = (path: string) => path === "/book" || path.startsWith("/book/details") || path.startsWith("/book/review");

export function ChromeSwitch({ site, booking = null }: { site: ReactNode; booking?: ReactNode }) {
  return inBookingFlow(usePathname()) ? booking : site;
}
