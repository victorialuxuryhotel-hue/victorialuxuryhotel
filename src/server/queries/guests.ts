import "server-only";
import type { GuestRow } from "@/domain/views";
import { authorizeRead } from "../auth";
import { first, getDb } from "../db";
import { GUEST_COLUMNS as COLUMNS, listGuestRecords, type GuestRecord as G, type GuestSort } from "../domain/guest-list";
import { listReservations } from "./reservations";

function toGuest(g: G): GuestRow & { notes?: string } {
  return {
    id: g.id,
    name: g.full_name,
    email: g.email ?? undefined,
    phone: g.phone ?? undefined,
    notes: g.notes ?? undefined,
    stays: g.stays,
    lastStay: g.last_stay ?? undefined,
    totalPaidKobo: g.total_paid,
  };
}

export async function listGuests(q?: string, page = 1, size = 50, sort: GuestSort = "recent"): Promise<GuestRow[]> {
  await authorizeRead("guests.manage");
  const rows = await listGuestRecords(await getDb(), { q, sort, page, size });
  return rows.map(toGuest);
}

export async function getGuest(id: string) {
  await authorizeRead("guests.manage");
  const g = await first<G>(await getDb(), `SELECT ${COLUMNS} FROM guests g WHERE g.id = ?`, id);
  if (!g) return null;
  return { guest: toGuest(g), stays: await listReservations({ tab: "all", guestId: id, pageSize: 500 }) };
}
