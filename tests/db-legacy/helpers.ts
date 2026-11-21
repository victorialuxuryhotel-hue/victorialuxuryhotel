import postgres from "postgres";
import { randomUUID } from "node:crypto";

/**
 * Superuser connection to the LOCAL Supabase database, used to set up fixtures
 * and assert on constraints. Refuses to run against anything but localhost.
 */
export const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):/.test(DB_URL)) {
  throw new Error("Database tests only run against a local database");
}

export function connect() {
  return postgres(DB_URL, { max: 4, onnotice: () => {} });
}

export type Sql = ReturnType<typeof connect>;

/** Expect a promise to fail with a Postgres error whose message matches. */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!pattern.test(message)) throw new Error(`Expected error matching ${pattern}, got: ${message}`);
    return;
  }
  throw new Error(`Expected database error matching ${pattern}, but the statement succeeded`);
}

export async function categoryId(sql: Sql, slug: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`select id from room_categories where slug = ${slug}`;
  if (!row) throw new Error(`Seed category ${slug} missing; run pnpm db:reset`);
  return row.id;
}

/** Creates an isolated room in a category so tests never collide with each other. */
export async function makeRoom(sql: Sql, slug: string, opts: { serviceStatus?: "in_service" | "maintenance" } = {}) {
  const [row] = await sql<{ id: string }[]>`
    insert into rooms (room_number, category_id, service_status)
    values (${"T" + randomUUID().slice(0, 8)}, ${await categoryId(sql, slug)}, ${opts.serviceStatus ?? "in_service"})
    returning id`;
  return row!.id;
}

export async function makeGuest(sql: Sql) {
  const [row] = await sql<{ id: string }[]>`
    insert into guests (full_name, email) values ('Test Guest', ${`guest-${randomUUID()}@example.com`}) returning id`;
  return row!.id;
}

type ReservationInput = {
  slug?: string;
  checkIn: string;
  checkOut: string;
  roomId?: string | null;
  status?: "pending_payment" | "confirmed";
  rateKobo?: number;
  holdMinutes?: number;
};

/** Raw insert (bypasses business functions) for constraint tests. */
export async function insertReservation(sql: Sql, input: ReservationInput) {
  const rate = input.rateKobo ?? 1_000_000;
  const [row] = await sql<{ id: string; reference: string }[]>`
    insert into reservations (guest_id, category_id, room_id, check_in, check_out, guest_count,
                              nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at)
    values (${await makeGuest(sql)}, ${await categoryId(sql, input.slug ?? "standard")}, ${input.roomId ?? null},
            ${input.checkIn}, ${input.checkOut}, 1, ${rate},
            ${rate} * (${input.checkOut}::date - ${input.checkIn}::date),
            ${input.status ?? "confirmed"}, 'phone',
            now() + make_interval(mins => ${input.holdMinutes ?? 30}))
    returning id, reference`;
  return row!;
}

/** A date far enough in the future that tests never collide with real "today" logic. */
export function futureDate(offsetDays: number, base = "2031-01-01") {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
