import "server-only";
import type { GuestRow } from "@/domain/views";
import { authorize } from "../auth";
import { all, first, getDb } from "../db";
import { cleanSearch } from "../db-errors";
import { listReservations } from "./reservations";

type G = { id: string; full_name: string; email: string | null; phone: string | null; notes: string | null; stays: number; last_stay: string | null; total_paid: number };

const COLUMNS = `g.id, g.full_name, g.email, g.phone, g.notes,
  (SELECT count(*) FROM reservations r WHERE r.guest_id = g.id AND r.status IN ('checked_in', 'checked_out')) AS stays,
  (SELECT max(r.check_in) FROM reservations r WHERE r.guest_id = g.id AND r.status IN ('checked_in', 'checked_out')) AS last_stay,
  (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
     FROM payments p JOIN reservations r ON r.id = p.reservation_id
     WHERE r.guest_id = g.id AND p.status = 'successful') AS total_paid`;

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

export async function listGuests(q?: string, page = 1, size = 50): Promise<GuestRow[]> {
  await authorize();
  const term = cleanSearch(q);
  const like = `%${term}%`;
  const rows = await all<G>(
    await getDb(),
    `SELECT ${COLUMNS} FROM guests g
     ${term ? "WHERE g.full_name LIKE ?1 OR g.phone LIKE ?1 OR g.email LIKE ?1" : "WHERE ?1 IS NOT NULL"}
     ORDER BY g.updated_at DESC, g.id LIMIT ?2 OFFSET ?3`,
    like,
    size + 1,
    (page - 1) * size,
  );
  return rows.map(toGuest);
}

export async function getGuest(id: string) {
  await authorize();
  const g = await first<G>(await getDb(), `SELECT ${COLUMNS} FROM guests g WHERE g.id = ?`, id);
  if (!g) return null;
  return { guest: toGuest(g), stays: await listReservations({ tab: "all", guestId: id, pageSize: 500 }) };
}
