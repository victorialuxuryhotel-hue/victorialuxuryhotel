"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Choosing, detailing, paying for and confirming a room have no site footer (designs G4–G8). */
const inBookingFlow = (path: string) => path === "/book" || path.startsWith("/book/details") || path.startsWith("/book/review") || path.startsWith("/book/confirmation");

export function ChromeSwitch({ site, booking = null }: { site: ReactNode; booking?: ReactNode }) {
  return inBookingFlow(usePathname()) ? booking : site;
}
