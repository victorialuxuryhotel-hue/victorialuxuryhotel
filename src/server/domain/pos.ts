import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { dbErrorToken } from "../db-errors";
import { activity, activityIfChanged, all, first, retryOnStale, MANAGERS, POS_SELLERS, POS_SETTLERS, requireRole, uuid, writeBatch, type Actor, type Db } from "../db";

export type Outlet = "restaurant" | "bar";
export type SaleMethod = "cash" | "bank_transfer" | "pos_terminal";
export const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
export const SALE_METHODS: Record<SaleMethod, string> = { cash: "Cash", bank_transfer: "Transfer", pos_terminal: "POS" };

export type MenuItem = { id: string; name: string; outlet: Outlet; price_kobo: number; is_active: number };

export async function listMenu(db: Db, actor: Actor): Promise<MenuItem[]> {
  requireRole(actor, POS_SELLERS);
  return all<MenuItem>(db, "SELECT id, name, outlet, price_kobo, is_active FROM menu_items ORDER BY outlet, is_active DESC, sort_order, name");
}

export async function addMenuItem(db: Db, actor: Actor, v: { name: string; outlet: Outlet; priceKobo: number }): Promise<string> {
  requireRole(actor, MANAGERS);
  const id = uuid();
  await writeBatch(db, actor, [
    db.prepare("INSERT INTO menu_items (id, name, outlet, price_kobo) VALUES (?, ?, ?, ?)").bind(id, v.name.trim(), v.outlet, v.priceKobo),
    activity(db, "menu.item_added", "menu_item", id, `${OUTLETS[v.outlet]} menu: ${v.name.trim()} at ${formatNaira(v.priceKobo)}`),
  ]);
  return id;
}

export async function setMenuItem(db: Db, actor: Actor, id: string, v: { priceKobo?: number; active?: boolean }): Promise<void> {
  requireRole(actor, MANAGERS);
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE menu_items SET price_kobo = coalesce(?1, price_kobo), is_active = coalesce(?2, is_active) WHERE id = ?3 AND (price_kobo <> coalesce(?1, price_kobo) OR is_active <> coalesce(?2, is_active))")
      .bind(v.priceKobo ?? null, v.active === undefined ? null : v.active ? 1 : 0, id),
    activityIfChanged(db, "menu.item_changed", "menu_item", id, v.priceKobo ? `Menu price changed to ${formatNaira(v.priceKobo)}` : `Menu item ${v.active ? "back on" : "taken off"} the menu`),
  ]);
  if (!r?.meta.changes && !(await first(db, "SELECT 1 FROM menu_items WHERE id = ?", id))) throw new AppError("NOT_FOUND", "Menu item not found.");
}

export async function inHouseGuests(db: Db, actor: Actor) {
  requireRole(actor, POS_SELLERS);
  return all<{ id: string; reference: string; guest: string; room: string | null }>(
    db,
    `SELECT r.id, r.reference, g.full_name AS guest, rm.room_number AS room
     FROM reservations r JOIN guests g ON g.id = r.guest_id LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.status = 'checked_in' ORDER BY length(rm.room_number), rm.room_number, g.full_name`,
  );
}

export async function recordSale(
  db: Db,
  actor: Actor,
  v: { outlet: Outlet; items: Array<{ menuItemId: string; quantity: number }>; method?: SaleMethod; reservationId?: string },
): Promise<{ id: string; number: number; totalKobo: number }> {
  requireRole(actor, POS_SELLERS);
  if (!v.items.length) throw new AppError("VALIDATION", "Add at least one item.");
  if (!v.method === !v.reservationId) throw new AppError("VALIDATION", "Choose how it's paid, or the room to charge.");
  const ids = [...new Set(v.items.map((i) => i.menuItemId))];
  const menu = await all<MenuItem>(db, `SELECT id, name, outlet, price_kobo, is_active FROM menu_items WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  const byId = new Map(menu.map((m) => [m.id, m]));
  const lines = v.items.map((i) => {
    const m = byId.get(i.menuItemId);
    if (!m || !m.is_active || m.outlet !== v.outlet) throw new AppError("VALIDATION", "One of the items is no longer on this menu.");
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99) throw new AppError("VALIDATION", "Quantities are 1 to 99.");
    return { ...m, quantity: i.quantity };
  });
  const total = lines.reduce((s, l) => s + l.price_kobo * l.quantity, 0);
  const id = uuid();
  const room = v.reservationId ? await first<{ reference: string }>(db, "SELECT reference FROM reservations WHERE id = ?", v.reservationId) : null;
  try {
    await writeBatch(db, actor, [
      db
        .prepare(
          `INSERT INTO sales (id, number, outlet, total_kobo, status, method, reservation_id, sold_by)
           SELECT ?, coalesce(max(number), 0) + 1, ?, ?, ?, ?, ?, ? FROM sales`,
        )
        .bind(id, v.outlet, total, v.reservationId ? "room_charge" : "paid", v.method ?? null, v.reservationId ?? null, actor.id),
      ...lines.map((l, n) =>
        db.prepare("INSERT INTO sale_items (sale_id, line, menu_item_id, name, unit_price_kobo, quantity) VALUES (?, ?, ?, ?, ?, ?)").bind(id, n + 1, l.id, l.name, l.price_kobo, l.quantity),
      ),
      activity(db, v.reservationId ? "sale.room_charge" : "sale.paid", "sale", id,
        `${OUTLETS[v.outlet]} sale ${formatNaira(total)}${room ? ` charged to ${room.reference}` : ` paid by ${SALE_METHODS[v.method!].toLowerCase()}`}`),
    ]);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "room_charge_not_in_house") throw new AppError("VALIDATION", "Only guests staying now can charge to their room.");
    throw err;
  }
  const row = await first<{ number: number }>(db, "SELECT number FROM sales WHERE id = ?", id);
  return { id, number: row!.number, totalKobo: total };
}

export async function settleRoomCharges(db: Db, actor: Actor, reservationId: string, method: SaleMethod): Promise<number> {
  requireRole(actor, POS_SETTLERS);
  return retryOnStale(async () => {
    const due = await first<{ kobo: number; n: number }>(
      db,
      "SELECT coalesce(sum(total_kobo), 0) AS kobo, count(*) AS n FROM sales WHERE reservation_id = ? AND status = 'room_charge'",
      reservationId,
    );
    if (!due?.n) throw new AppError("VALIDATION", "There are no unpaid charges.");
    await writeBatch(db, actor, [
      db
        .prepare(
          `INSERT INTO _guard (ok) SELECT 0 WHERE (SELECT count(*) FROM sales WHERE reservation_id = ?1 AND status = 'room_charge') <> ?2
             OR (SELECT coalesce(sum(total_kobo), 0) FROM sales WHERE reservation_id = ?1 AND status = 'room_charge') <> ?3`,
        )
        .bind(reservationId, due.n, due.kobo),
      db
        .prepare("UPDATE sales SET status = 'settled', method = ?, settled_by = ?, settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE reservation_id = ? AND status = 'room_charge'")
        .bind(method, actor.id, reservationId),
      activity(db, "sale.settled", "reservation", reservationId, `Restaurant & bar charges settled: ${formatNaira(due.kobo)} by ${SALE_METHODS[method].toLowerCase()}`),
    ]);
    return due.kobo;
  });
}

export async function voidSale(db: Db, actor: Actor, saleId: string, reason: string): Promise<void> {
  requireRole(actor, MANAGERS);
  const why = reason.trim();
  if (why.length < 3) throw new AppError("VALIDATION", "Give a reason.");
  const [r] = await writeBatch(db, actor, [
    db.prepare("UPDATE sales SET status = 'void', voided_by = ?, void_reason = ? WHERE id = ? AND status IN ('paid', 'room_charge')").bind(actor.id, why, saleId),
    activityIfChanged(db, "sale.voided", "sale", saleId, `Sale voided: ${why}`),
  ]);
  if (!r?.meta.changes) throw new AppError("INVALID_TRANSITION", "Only open or paid sales can be voided.");
}

export type SaleRow = {
  id: string; number: number; outlet: Outlet; total_kobo: number; status: "paid" | "room_charge" | "settled" | "void"; method: SaleMethod | null;
  created_at: string; sold_by_name: string | null; room_reference: string | null; items: string;
};

export async function salesToday(db: Db, actor: Actor, day: string): Promise<SaleRow[]> {
  requireRole(actor, POS_SELLERS);
  return all<SaleRow>(
    db,
    `SELECT s.id, s.number, s.outlet, s.total_kobo, s.status, s.method, s.created_at, st.full_name AS sold_by_name, r.reference AS room_reference,
            (SELECT group_concat(i.quantity || ' × ' || i.name, ', ') FROM sale_items i WHERE i.sale_id = s.id) AS items
     FROM sales s LEFT JOIN staff_profiles st ON st.id = s.sold_by LEFT JOIN reservations r ON r.id = s.reservation_id
     WHERE date(s.created_at, '+1 hour') = ? ORDER BY s.number DESC LIMIT 200`,
    day,
  );
}

export async function chargesFor(db: Db, actor: Actor, reservationId: string) {
  requireRole(actor, [...POS_SETTLERS, ...POS_SELLERS]);
  return all<{ id: string; number: number; total_kobo: number; status: string; created_at: string; items: string }>(
    db,
    `SELECT s.id, s.number, s.total_kobo, s.status, s.created_at,
            (SELECT group_concat(i.quantity || ' × ' || i.name, ', ') FROM sale_items i WHERE i.sale_id = s.id) AS items
     FROM sales s WHERE s.reservation_id = ? AND s.status <> 'void' ORDER BY s.created_at`,
    reservationId,
  );
}
