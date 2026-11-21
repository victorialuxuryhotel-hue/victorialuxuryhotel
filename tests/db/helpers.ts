import { getPlatformProxy } from "wrangler";
import { afterAll } from "vitest";
import type { Actor, Db } from "@/server/db";
import { addDays, hotelToday } from "@/lib/hotel-date";
import { TEST_DB_DIR } from "./global-setup";

/**
 * Test access to the throwaway local D1 database (the real D1 engine, via
 * wrangler's platform proxy). Domain functions take the database and the
 * acting staff member as arguments, so tests call them exactly as the app does.
 */
const proxy = await getPlatformProxy<{ DB: Db }>({ persist: { path: `${TEST_DB_DIR}/v3` } });
export const db = proxy.env.DB;
afterAll(() => proxy.dispose());

// Seeded staff (db/seed.sql).
export const owner: Actor = { id: "00000000-0000-4000-8000-0000000000a1", role: "owner" };
export const gm: Actor = { id: "00000000-0000-4000-8000-0000000000a2", role: "general_manager" };
export const desk: Actor = { id: "00000000-0000-4000-8000-0000000000a3", role: "front_desk" };

export const today = () => hotelToday();
export const day = (n: number) => addDays(hotelToday(), n);
export const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

export async function q<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results;
}
export async function q1<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T> {
  const row = await db.prepare(sql).bind(...params).first<T>();
  if (!row) throw new Error(`No row for: ${sql}`);
  return row;
}
export const exec = (sql: string, ...params: unknown[]) => db.prepare(sql).bind(...params).run();

/** Expects a promise to reject with a message (AppError message, or a raw trigger token) matching. */
export async function rejects(promise: Promise<unknown>, pattern: RegExp, code?: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!pattern.test(message)) throw new Error(`Expected error matching ${pattern}, got: ${message}`);
    if (code && (err as { code?: string }).code !== code) throw new Error(`Expected code ${code}, got ${(err as { code?: string }).code}: ${message}`);
    return;
  }
  throw new Error(`Expected an error matching ${pattern}, but it succeeded`);
}

const rand = () => crypto.randomUUID().slice(0, 8);

/**
 * An isolated room type with `rooms` in-service rooms, so capacity tests never
 * collide with each other or the seed.
 */
export async function makeCategory(rooms: number, opts: { rateKobo?: number; maxOccupancy?: number } = {}) {
  const id = crypto.randomUUID();
  const slug = `t-${rand()}`;
  await exec(
    "INSERT INTO room_categories (id, slug, name, nightly_rate_kobo, max_occupancy) VALUES (?, ?, ?, ?, ?)",
    id, slug, `Test ${slug}`, opts.rateKobo ?? 5_000_000, opts.maxOccupancy ?? 2,
  );
  const roomIds: string[] = [];
  for (let i = 0; i < rooms; i++) roomIds.push(await makeRoom(id));
  return { id, slug, roomIds };
}

export async function makeRoom(categoryId: string, opts: { serviceStatus?: "in_service" | "maintenance" } = {}) {
  const id = crypto.randomUUID();
  await exec("INSERT INTO rooms (id, room_number, category_id, service_status) VALUES (?, ?, ?, ?)", id, `T${rand()}`, categoryId, opts.serviceStatus ?? "in_service");
  return id;
}

export async function makeGuest(email: string | null = `guest-${rand()}@example.com`) {
  const id = crypto.randomUUID();
  await exec("INSERT INTO guests (id, full_name, email) VALUES (?, 'Test Guest', ?)", id, email);
  return id;
}

/** Inserts a reservation directly (bypassing business rules, but not triggers). */
export async function insertReservation(input: {
  categoryId: string;
  checkIn: string;
  checkOut: string;
  roomId?: string | null;
  status?: "pending_payment" | "confirmed";
  rateKobo?: number;
  holdMinutes?: number;
  guestId?: string;
  source?: string;
}) {
  const id = crypto.randomUUID();
  const rate = input.rateKobo ?? 5_000_000;
  const nights = Math.round((Date.parse(input.checkOut) - Date.parse(input.checkIn)) / 86_400_000);
  const ref = "VL-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
  await exec(
    `INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
       nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    id, ref, crypto.randomUUID(), input.guestId ?? (await makeGuest()), input.categoryId, input.roomId ?? null,
    input.checkIn, input.checkOut, rate, rate * nights, input.status ?? "pending_payment", input.source ?? "staff",
    input.status === "confirmed" ? null : iso((input.holdMinutes ?? 60) * 60_000),
  );
  return id;
}

export const status = async (reservationId: string) => (await q1<{ status: string }>("SELECT status FROM reservations WHERE id = ?", reservationId)).status;

/** Moves a reservation's hold into the past (as if the guest never paid in time). */
export const lapseHold = (reservationId: string) => exec("UPDATE reservations SET hold_expires_at = ? WHERE id = ?", iso(-60_000), reservationId);
