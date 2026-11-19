"use server";

import type { ActionResult } from "@/lib/errors";

/** Design preview only: never creates a booking. */
export async function previewBooking(): Promise<ActionResult> {
  return { ok: false, code: "VALIDATION", message: "This is a design preview. Use the real booking page to make a reservation." };
}
