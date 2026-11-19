import "server-only";
import type { GuestRow } from "@/domain/views";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch } from "../db-errors";
import { listReservations, netPaid } from "./reservations";

type G = {
  id: string; full_name: string; email: string | null; phone: string | null; notes: string | null;
  reservations: Array<{ status: string; check_in: string; payments: Array<{ amount_kobo: number; kind: "payment" | "refund"; status: string }> }>;
};

function toGuest(g: G): GuestRow & { notes?: string } {
  const stays = g.reservations.filter((r) => ["checked_in", "checked_out"].includes(r.status));
  return {
    id: g.id,
    name: g.full_name,
    email: g.email ?? undefined,
    phone: g.phone ?? undefined,
    notes: g.notes ?? undefined,
    stays: stays.length,
    lastStay: stays.map((s) => s.check_in).sort().at(-1),
    totalPaidKobo: g.reservations.reduce((sum, r) => sum + netPaid(r.payments), 0),
  };
}

const select = "id, full_name, email, phone, notes, reservations(status, check_in, payments(amount_kobo, kind, status))";

export async function listGuests(q?: string, page = 1, size = 50): Promise<GuestRow[]> {
  const supabase = await createClient();
  const from = (page - 1) * size;
  let query = supabase.from("guests").select(select).order("updated_at", { ascending: false }).order("id").range(from, from + size);
  const term = cleanSearch(q);
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error("Could not load guests", { cause: error });
  return (data as unknown as G[]).map(toGuest);
}

export async function getGuest(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("guests").select(select).eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load guest", { cause: error });
  if (!data) return null;
  const guest = toGuest(data as unknown as G);
  return { guest, stays: await listReservations({ tab: "all", guestId: id, pageSize: 500 }) };
}
