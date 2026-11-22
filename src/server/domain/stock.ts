import { AppError } from "@/lib/errors";
import { dbErrorToken } from "../db-errors";
import { activity, all, MANAGERS, requireRole, STOCK_USERS, uuid, writeBatch, type Actor, type Db } from "../db";

/**
 * Stock: items with a unit, a current quantity and a low-stock level.
 * Quantities change only through recorded movements (received, used,
 * adjusted), which the database applies and never lets go below zero.
 */
export type StockItem = { id: string; name: string; unit: string; quantity: number; min_quantity: number; is_active: number };
export type MoveKind = "received" | "used" | "adjusted";

export async function listStock(db: Db, actor: Actor): Promise<StockItem[]> {
  requireRole(actor, STOCK_USERS);
  return all<StockItem>(db, "SELECT id, name, unit, quantity, min_quantity, is_active FROM stock_items WHERE is_active = 1 ORDER BY quantity <= min_quantity DESC, name");
}

export async function addStockItem(db: Db, actor: Actor, v: { name: string; unit: string; minQuantity: number; opening: number }): Promise<string> {
  requireRole(actor, MANAGERS);
  const id = uuid();
  try {
    await writeBatch(db, actor, [
      db.prepare("INSERT INTO stock_items (id, name, unit, min_quantity) VALUES (?, ?, ?, ?)").bind(id, v.name.trim(), v.unit.trim(), v.minQuantity),
      ...(v.opening > 0
        ? [db.prepare("INSERT INTO stock_moves (item_id, change, kind, note, staff_id) VALUES (?, ?, 'adjusted', 'Opening stock', ?)").bind(id, v.opening, actor.id)]
        : []),
      activity(db, "stock.item_added", "stock_item", id, `Stock item added: ${v.name.trim()} (${v.opening} ${v.unit.trim()})`),
    ]);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "unique") throw new AppError("CONFLICT", "There's already an item with that name.");
    throw err;
  }
  return id;
}

/** Record a movement. Anyone on stock can record what they used; deliveries and corrections are for managers. */
export async function recordMove(db: Db, actor: Actor, v: { itemId: string; kind: MoveKind; quantity: number; note: string | null }): Promise<void> {
  requireRole(actor, v.kind === "used" ? STOCK_USERS : MANAGERS);
  if (!Number.isInteger(v.quantity) || v.quantity === 0 || Math.abs(v.quantity) > 1_000_000) throw new AppError("VALIDATION", "Enter a whole number.");
  if (v.kind !== "adjusted" && v.quantity < 0) throw new AppError("VALIDATION", "Enter a positive number.");
  if (v.kind === "adjusted" && !v.note?.trim()) throw new AppError("VALIDATION", "Say why the count changed.");
  const change = v.kind === "used" ? -v.quantity : v.quantity;
  try {
    await writeBatch(db, actor, [
      db.prepare("INSERT INTO stock_moves (item_id, change, kind, note, staff_id) VALUES (?, ?, ?, ?, ?)").bind(v.itemId, change, v.kind, v.note?.trim() || null, actor.id),
      activity(db, `stock.${v.kind}`, "stock_item", v.itemId, `Stock ${v.kind}: ${change > 0 ? "+" : ""}${change}${v.note?.trim() ? ` (${v.note.trim()})` : ""}`),
    ]);
  } catch (err) {
    const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
    if (token === "check") throw new AppError("VALIDATION", "There isn't that much in stock.");
    if (token === "foreign_key") throw new AppError("NOT_FOUND", "Stock item not found.");
    throw err;
  }
}

export async function recentMoves(db: Db, actor: Actor) {
  requireRole(actor, STOCK_USERS);
  return all<{ id: number; item: string; unit: string; change: number; kind: MoveKind; note: string | null; who: string | null; created_at: string }>(
    db,
    `SELECT m.id, i.name AS item, i.unit, m.change, m.kind, m.note, s.full_name AS who, m.created_at
     FROM stock_moves m JOIN stock_items i ON i.id = m.item_id LEFT JOIN staff_profiles s ON s.id = m.staff_id
     ORDER BY m.id DESC LIMIT 30`,
  );
}
