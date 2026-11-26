"use server";

import { can } from "@/lib/auth/permissions";
import { authorizeRead } from "./auth";
import { getDb } from "./db";
import { globalSearch, type SearchResults } from "./domain/search";

/** The header search (I9). Only the groups this role can open; nothing at all on error. */
export async function searchEverything(q: string): Promise<SearchResults> {
  try {
    const staff = await authorizeRead(["guests.manage", "reservations.manage", "reports.view", "rooms.status"]);
    const scopes = {
      guests: can(staff.role, "guests.manage"),
      bookings: can(staff.role, "reservations.manage") || can(staff.role, "reports.view"),
      rooms: can(staff.role, "rooms.status"),
    };
    return await globalSearch(await getDb(), scopes, String(q).slice(0, 60));
  } catch {
    return { guests: [], bookings: [], rooms: [] };
  }
}
