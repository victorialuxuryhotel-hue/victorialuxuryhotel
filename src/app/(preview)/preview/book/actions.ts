"use server";

import type { ActionResult } from "@/lib/errors";

export async function previewBooking(): Promise<ActionResult> {
  return { ok: false, code: "VALIDATION", message: "This is a design preview. Use the real booking page to make a reservation." };
}
