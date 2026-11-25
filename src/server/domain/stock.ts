import { AppError } from "@/lib/errors";
import { addDays, businessDayStart } from "@/lib/hotel-date";
import { dbErrorToken } from "../db-errors";
import { activity, activityIfChanged, all, first, POS_MANAGERS, requireRole, STOCK_VIEWERS, uuid, writeBatch, type Actor, type Db, type StaffRole } from "../db";

export type StockCategory = "drinks" | "food" | "ingredients" | "supplies" | "other";
export const STOCK_CATEGORIES: Record<StockCategory, string> = { drinks: "Drinks", food: "Food", ingredients: "Ingredients", supplies: "Supplies", other: "Other" };

export type MoveKind = "received" | "used" | "adjusted" | "wasted" | "sold" | "returned";
export const MOVE_KINDS: Record<MoveKind, string> = {
  received: "Received", used: "Used", adjusted: "Count fix", wasted: "Damaged / expired / wasted", sold: "Sold", returned: "Returned (sale voided)",
};
export type ManualKind = "received" | "used" | "adjusted" | "wasted";

export type StockItem = {
  id: string; name: string; unit: string; category: StockCategory; quantity: number; min_quantity: number; is_active: number; last_update: string | null;
};

const VIEW = [...new Set([...STOCK_VIEWERS, ...POS_MANAGERS])] as StaffRole[];

export async function listStock(db: Db, actor: Actor): Promise<StockItem[]> {
  requireRole(actor, VIEW);
  return all<StockItem>(
    db,
    `SELECT s.id, s.name, s.unit, s.category, s.quantity, s.min_quantity, s.is_active,
            (SELECT max(m.created_at) FROM stock_moves m WHERE m.item_id = s.id) AS last_update
     FROM stock_items s WHERE s.is_active = 1 ORDER BY s.quantity <= s.min_quantity DESC, s.category, s.name`,
  );
}

export async function addStockItem(
  db: Db,
  actor: Actor,
  v: { name: string; unit: string; category?: StockCategory; minQuantity: number; opening: number },
): Promise<string> {
  requireRole(actor, POS_MANAGERS);
  const id = uuid();
  try {
    await writeBatch(db, actor, [
      db.prepare("INSERT INTO stock_items (id, name, unit, category, min_quantity) VALUES (?, ?, ?, ?, ?)").bind(id, v.name.trim(), v.unit.trim(), v.category ?? "other", v.minQuantity),
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

export async function updateStockItem(db: Db, actor: Actor, id: string, v: { category: StockCategory; minQuantity: number; active: boolean }): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  if (!(v.category in STOCK_CATEGORIES)) throw new AppError("VALIDATION", "Choose a category.");
  if (!Number.isInteger(v.minQuantity) || v.minQuantity < 0 || v.minQuantity > 1_000_000) throw new AppError("VALIDATION", "Enter the low-stock level as a whole number.");
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE stock_items SET category = ?1, min_quantity = ?2, is_active = ?3 WHERE id = ?4 AND (category IS NOT ?1 OR min_quantity IS NOT ?2 OR is_active IS NOT ?3)")
      .bind(v.category, v.minQuantity, v.active ? 1 : 0, id),
    activityIfChanged(db, "stock.item_changed", "stock_item", id, `Stock item updated: reorder at ${v.minQuantity}${v.active ? "" : ", no longer tracked"}`),
  ]);
  if (!r?.meta.changes && !(await first(db, "SELECT 1 FROM stock_items WHERE id = ?", id))) throw new AppError("NOT_FOUND", "Stock item not found.");
}

export async function recordMove(db: Db, actor: Actor, v: { itemId: string; kind: ManualKind; quantity: number; note: string | null }): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  if (!["received", "used", "adjusted", "wasted"].includes(v.kind)) throw new AppError("VALIDATION", "Choose what happened.");
  if (!Number.isInteger(v.quantity) || v.quantity === 0 || Math.abs(v.quantity) > 1_000_000) throw new AppError("VALIDATION", "Enter a whole number.");
  if (v.kind !== "adjusted" && v.quantity < 0) throw new AppError("VALIDATION", "Enter a positive number.");
  if ((v.kind === "adjusted" || v.kind === "wasted") && (v.note?.trim().length ?? 0) < 3) {
    throw new AppError("VALIDATION", v.kind === "wasted" ? "Say what happened, e.g. 2 bottles broken." : "Say why the count changed.");
  }
  const change = v.kind === "used" || v.kind === "wasted" ? -v.quantity : v.quantity;
  try {
    await writeBatch(db, actor, [
      db.prepare("INSERT INTO stock_moves (item_id, change, kind, note, staff_id) VALUES (?, ?, ?, ?, ?)").bind(v.itemId, change, v.kind, v.note?.trim() || null, actor.id),
      activity(db, `stock.${v.kind}`, "stock_item", v.itemId, `Stock ${MOVE_KINDS[v.kind].toLowerCase()}: ${change > 0 ? "+" : ""}${change}${v.note?.trim() ? ` (${v.note.trim()})` : ""}`),
    ]);
  } catch (err) {
    const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
    if (token === "check") throw new AppError("VALIDATION", "There isn't that much in stock.");
    if (token === "foreign_key") throw new AppError("NOT_FOUND", "Stock item not found.");
    throw err;
  }
}

export type MoveRow = { id: number; item: string; unit: string; change: number; kind: MoveKind; note: string | null; who: string | null; created_at: string; order_number: number | null };

export async function stockMoves(db: Db, actor: Actor, f: { from?: string; to?: string; kind?: MoveKind; itemId?: string; limit?: number } = {}): Promise<MoveRow[]> {
  requireRole(actor, VIEW);
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.from) { where.push("m.created_at >= ?"); params.push(businessDayStart(f.from)); }
  if (f.to) { where.push("m.created_at < ?"); params.push(businessDayStart(addDays(f.to, 1))); }
  if (f.kind) { where.push("m.kind = ?"); params.push(f.kind); }
  if (f.itemId) { where.push("m.item_id = ?"); params.push(f.itemId); }
  return all<MoveRow>(
    db,
    `SELECT m.id, i.name AS item, i.unit, m.change, m.kind, m.note, s.full_name AS who, m.created_at, o.number AS order_number
     FROM stock_moves m JOIN stock_items i ON i.id = m.item_id LEFT JOIN staff_profiles s ON s.id = m.staff_id LEFT JOIN pos_orders o ON o.id = m.order_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY m.id DESC LIMIT ${Math.min(f.limit ?? 50, 5000)}`,
    ...params,
  );
}

export const recentMoves = (db: Db, actor: Actor) => stockMoves(db, actor, { limit: 30 });
