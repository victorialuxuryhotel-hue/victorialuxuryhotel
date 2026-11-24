import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { addDays, businessDate, businessDayStart } from "@/lib/hotel-date";
import { dbErrorToken } from "../db-errors";
import {
  activity,
  activityIfChanged,
  all,
  first,
  POS_MANAGERS,
  POS_SELLERS,
  POS_VIEWERS,
  requireRole,
  uuid,
  writeBatch,
  type Actor,
  type Db,
  type StaffRole,
} from "../db";

export type Outlet = "restaurant" | "bar";
export type PayMethod = "cash" | "bank_transfer" | "pos_terminal";
export type MenuCategory = "meals" | "snacks" | "soft_drinks" | "alcoholic_drinks" | "other";
export type OrderStatus = "open" | "paid" | "cancelled" | "void";

export const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
export const PAY_METHODS: Record<PayMethod, string> = { cash: "Cash", bank_transfer: "Bank transfer", pos_terminal: "POS / card" };
export const MENU_CATEGORIES: Record<MenuCategory, string> = {
  meals: "Meals", snacks: "Snacks", soft_drinks: "Soft drinks", alcoholic_drinks: "Alcoholic drinks", other: "Other",
};
export const ORDER_STATUS: Record<OrderStatus, string> = { open: "Unpaid", paid: "Paid", cancelled: "Cancelled", void: "Voided" };

const ALL_POS = [...new Set([...POS_SELLERS, ...POS_VIEWERS])] as StaffRole[];
const naira = (k: number) => formatNaira(k).replace(/\s/g, "");
const dayStart = (d: string) => businessDayStart(d);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export type MenuItem = {
  id: string; name: string; outlet: Outlet; category: MenuCategory; price_kobo: number; is_active: number; is_available: number;
  stock_left: number | null; links: { stockItemId: string; name: string; unit: string; quantity: number }[];
};

export async function listMenu(db: Db, actor: Actor, opts: { includeInactive?: boolean } = {}): Promise<MenuItem[]> {
  requireRole(actor, ALL_POS);
  const [items, links] = await Promise.all([
    all<Omit<MenuItem, "links" | "stock_left">>(
      db,
      `SELECT id, name, outlet, category, price_kobo, is_active, is_available FROM menu_items
       ${opts.includeInactive ? "" : "WHERE is_active = 1"} ORDER BY outlet, is_active DESC, sort_order, name`,
    ),
    all<{ menu_item_id: string; stock_item_id: string; name: string; unit: string; quantity: number; on_hand: number }>(
      db,
      `SELECT l.menu_item_id, l.stock_item_id, s.name, s.unit, l.quantity, s.quantity AS on_hand
       FROM menu_item_stock l JOIN stock_items s ON s.id = l.stock_item_id ORDER BY s.name`,
    ),
  ]);
  return items.map((m) => {
    const mine = links.filter((l) => l.menu_item_id === m.id);
    return {
      ...m,
      links: mine.map((l) => ({ stockItemId: l.stock_item_id, name: l.name, unit: l.unit, quantity: l.quantity })),
      stock_left: mine.length ? Math.min(...mine.map((l) => Math.floor(l.on_hand / l.quantity))) : null,
    };
  });
}

export async function saveMenuItem(
  db: Db,
  actor: Actor,
  v: { id?: string; name: string; outlet: Outlet; category: MenuCategory; priceKobo: number; available: boolean; active: boolean },
): Promise<string> {
  requireRole(actor, POS_MANAGERS);
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) throw new AppError("VALIDATION", "Enter the item's name.");
  if (!Number.isInteger(v.priceKobo) || v.priceKobo <= 0 || v.priceKobo > 1_000_000_000) throw new AppError("VALIDATION", "Enter a price.");
  if (!(v.outlet in OUTLETS) || !(v.category in MENU_CATEGORIES)) throw new AppError("VALIDATION", "Choose where it's sold and its category.");
  const id = v.id ?? uuid();
  const flags = [v.available ? 1 : 0, v.active ? 1 : 0] as const;
  const [r] = await writeBatch(db, actor, [
    v.id
      ? db
          .prepare(
            `UPDATE menu_items SET name = ?1, outlet = ?2, category = ?3, price_kobo = ?4, is_available = ?5, is_active = ?6 WHERE id = ?7
               AND (name IS NOT ?1 OR outlet IS NOT ?2 OR category IS NOT ?3 OR price_kobo IS NOT ?4 OR is_available IS NOT ?5 OR is_active IS NOT ?6)`,
          )
          .bind(name, v.outlet, v.category, v.priceKobo, ...flags, id)
      : db.prepare("INSERT INTO menu_items (id, name, outlet, category, price_kobo, is_available, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, name, v.outlet, v.category, v.priceKobo, ...flags),
    activityIfChanged(
      db,
      v.id ? "menu.item_changed" : "menu.item_added",
      "menu_item",
      id,
      `${OUTLETS[v.outlet]} menu: ${name}, ${naira(v.priceKobo)}${v.active ? (v.available ? "" : " (unavailable today)") : " (taken off the menu)"}`,
    ),
  ]);
  if (v.id && !r?.meta.changes && !(await first(db, "SELECT 1 FROM menu_items WHERE id = ?", id))) throw new AppError("NOT_FOUND", "Menu item not found.");
  return id;
}

export async function setMenuItemStock(db: Db, actor: Actor, menuItemId: string, links: { stockItemId: string; quantity: number }[]): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  if (links.length > 20) throw new AppError("VALIDATION", "Link at most 20 stock items.");
  const seen = new Set<string>();
  for (const l of links) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 1000) throw new AppError("VALIDATION", "Each stock quantity must be a whole number from 1.");
    if (seen.has(l.stockItemId)) throw new AppError("VALIDATION", "Each stock item can be linked once.");
    seen.add(l.stockItemId);
  }
  const item = await first<{ name: string }>(db, "SELECT name FROM menu_items WHERE id = ?", menuItemId);
  if (!item) throw new AppError("NOT_FOUND", "Menu item not found.");
  const names = links.length
    ? await all<{ id: string; name: string; unit: string }>(db, `SELECT id, name, unit FROM stock_items WHERE id IN (${links.map(() => "?").join(",")})`, ...links.map((l) => l.stockItemId))
    : [];
  if (names.length !== links.length) throw new AppError("VALIDATION", "Choose stock items from the list.");
  const label = links.map((l) => { const s = names.find((n) => n.id === l.stockItemId)!; return `${l.quantity} ${s.unit} ${s.name}`; }).join(", ");
  try {
    await writeBatch(db, actor, [
      db.prepare("DELETE FROM menu_item_stock WHERE menu_item_id = ?").bind(menuItemId),
      ...links.map((l) => db.prepare("INSERT INTO menu_item_stock (menu_item_id, stock_item_id, quantity) VALUES (?, ?, ?)").bind(menuItemId, l.stockItemId, l.quantity)),
      activity(db, "menu.stock_linked", "menu_item", menuItemId, links.length ? `${item.name} uses ${label}` : `${item.name} no longer takes stock`),
    ]);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "foreign_key") throw new AppError("VALIDATION", "Choose stock items from the list.");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderLine = { menuItemId: string; quantity: number };

type Priced = { menuItemId: string; name: string; category: MenuCategory; unitKobo: number; quantity: number };

async function price(db: Db, outlet: Outlet, lines: OrderLine[]): Promise<{ priced: Priced[]; totalKobo: number }> {
  if (!lines.length) throw new AppError("VALIDATION", "Add at least one item.");
  if (lines.length > 50) throw new AppError("VALIDATION", "That's too many lines for one order.");
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new AppError("VALIDATION", "Quantities must be whole numbers from 1.");
    merged.set(l.menuItemId, (merged.get(l.menuItemId) ?? 0) + l.quantity);
  }
  const ids = [...merged.keys()];
  const menu = await all<{ id: string; name: string; outlet: Outlet; category: MenuCategory; price_kobo: number; is_active: number; is_available: number }>(
    db,
    `SELECT id, name, outlet, category, price_kobo, is_active, is_available FROM menu_items WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const priced = ids.map((id) => {
    const m = menu.find((x) => x.id === id);
    if (!m || !m.is_active) throw new AppError("VALIDATION", "An item is no longer on the menu. Remove it and try again.");
    if (!m.is_available) throw new AppError("VALIDATION", `${m.name} is unavailable today.`);
    if (m.outlet !== outlet) throw new AppError("VALIDATION", `${m.name} is on the ${OUTLETS[m.outlet].toLowerCase()} menu.`);
    const quantity = merged.get(id)!;
    if (quantity > 99) throw new AppError("VALIDATION", `At most 99 × ${m.name} in one order.`);
    return { menuItemId: id, name: m.name, category: m.category, unitKobo: m.price_kobo, quantity };
  });
  return { priced, totalKobo: priced.reduce((s, p) => s + p.unitKobo * p.quantity, 0) };
}

/** Names the first stock item that can't cover these lines, so the attendant sees why. */
async function checkStock(db: Db, lines: { menuItemId: string; quantity: number }[]): Promise<void> {
  if (!lines.length) return;
  const need = await all<{ stock_item_id: string; name: string; unit: string; on_hand: number; per: number; menu_item_id: string }>(
    db,
    `SELECT l.stock_item_id, s.name, s.unit, s.quantity AS on_hand, l.quantity AS per, l.menu_item_id
     FROM menu_item_stock l JOIN stock_items s ON s.id = l.stock_item_id WHERE l.menu_item_id IN (${lines.map(() => "?").join(",")})`,
    ...lines.map((l) => l.menuItemId),
  );
  const total = new Map<string, { name: string; unit: string; on_hand: number; need: number }>();
  for (const n of need) {
    const qty = lines.find((l) => l.menuItemId === n.menu_item_id)!.quantity;
    const t = total.get(n.stock_item_id) ?? { name: n.name, unit: n.unit, on_hand: n.on_hand, need: 0 };
    t.need += n.per * qty;
    total.set(n.stock_item_id, t);
  }
  for (const t of total.values()) {
    if (t.need > t.on_hand) throw new AppError("VALIDATION", `Not enough ${t.name} in stock: ${t.on_hand} ${t.unit} left, ${t.need} needed. A manager can record the delivery or fix the count.`);
  }
}

async function assertNotClosed(db: Db, staffId: string): Promise<void> {
  if (await first(db, "SELECT 1 FROM pos_closings WHERE staff_id = ? AND business_date = ?", staffId, businessDate())) {
    throw new AppError("CONFLICT", "You've already closed today's sales. Ask a manager if you need to sell more today.");
  }
}

const orderInsert = (db: Db, id: string, outlet: Outlet, totalKobo: number, note: string | null, staffId: string) => [
  db.prepare("UPDATE pos_counters SET value = value + 1 WHERE name = 'order'"),
  db
    .prepare("INSERT INTO pos_orders (id, number, outlet, total_kobo, note, created_by) VALUES (?, (SELECT value FROM pos_counters WHERE name = 'order'), ?, ?, ?, ?)")
    .bind(id, outlet, totalKobo, note, staffId),
];

const lineInserts = (db: Db, id: string, priced: Priced[]) =>
  priced.map((p, i) =>
    db
      .prepare("INSERT INTO pos_order_items (order_id, line, menu_item_id, name, category, unit_price_kobo, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, i + 1, p.menuItemId, p.name, p.category, p.unitKobo, p.quantity),
  );

function payStatements(db: Db, id: string, staffId: string, method: PayMethod, totalKobo: number, cashReceivedKobo: number | null) {
  return [
    db.prepare("UPDATE pos_counters SET value = value + 1 WHERE name = 'receipt'"),
    db
      .prepare(
        `UPDATE pos_orders SET status = 'paid', method = ?, paid_by = ?, cash_received_kobo = ?, paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           receipt_number = 'RB-' || strftime('%Y', 'now', '+1 hour') || '-' || printf('%06d', (SELECT value FROM pos_counters WHERE name = 'receipt'))
         WHERE id = ? AND status = 'open' AND total_kobo = ?`,
      )
      .bind(method, staffId, cashReceivedKobo, id, totalKobo),
    db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0"),
    db
      .prepare(
        `INSERT INTO stock_moves (item_id, change, kind, order_id, staff_id)
         SELECT l.stock_item_id, -sum(l.quantity * i.quantity), 'sold', ?1, ?2
         FROM pos_order_items i JOIN menu_item_stock l ON l.menu_item_id = i.menu_item_id
         WHERE i.order_id = ?1 GROUP BY l.stock_item_id`,
      )
      .bind(id, staffId),
  ];
}

function validCash(method: PayMethod, totalKobo: number, cashReceivedKobo: number | null | undefined): number | null {
  if (method !== "cash" || cashReceivedKobo == null) return null;
  if (!Number.isInteger(cashReceivedKobo) || cashReceivedKobo < totalKobo) throw new AppError("VALIDATION", `The customer must give at least ${naira(totalKobo)}.`);
  if (cashReceivedKobo > totalKobo + 100_000_000) throw new AppError("VALIDATION", "Check the amount the customer gave.");
  return cashReceivedKobo;
}

async function payFailed(db: Db, err: unknown, lines: { menuItemId: string; quantity: number }[]): Promise<never> {
  const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
  if (token === "check") {
    await checkStock(db, lines);
    throw new AppError("VALIDATION", "Not enough stock for this order. A manager can record the delivery or fix the count.");
  }
  if (err instanceof Error && err.name === "StaleStateError") throw new AppError("CONFLICT", "This order was just changed or paid by someone else. Reload and check it.");
  throw err;
}

const isUnique = (err: unknown) => err instanceof AppError && dbErrorToken(err.cause) === "unique";

async function orderState(db: Db, id: string) {
  return first<{ status: OrderStatus; outlet: Outlet; total_kobo: number }>(db, "SELECT status, outlet, total_kobo FROM pos_orders WHERE id = ?", id);
}

const replaceLines = (db: Db, id: string, priced: Priced[], totalKobo: number, note: string | null) => [
  db.prepare("DELETE FROM pos_order_items WHERE order_id = ?").bind(id),
  ...lineInserts(db, id, priced),
  db.prepare("UPDATE pos_orders SET total_kobo = ?, note = ? WHERE id = ? AND status = 'open'").bind(totalKobo, note, id),
  db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0"),
];

/**
 * Save an unpaid order. The till makes the order's id when the order starts, so
 * saving again (or a retry after a dropped connection) updates the same order.
 */
export async function saveOrder(
  db: Db,
  actor: Actor,
  v: { id: string; outlet: Outlet; lines: OrderLine[]; note?: string | null },
): Promise<{ id: string; number: number; totalKobo: number }> {
  requireRole(actor, POS_SELLERS);
  await assertNotClosed(db, actor.id);
  const { priced, totalKobo } = await price(db, v.outlet, v.lines);
  await checkStock(db, priced);
  const note = v.note?.trim().slice(0, 120) || null;
  const update = async () => {
    const cur = await orderState(db, v.id);
    if (!cur) throw new AppError("NOT_FOUND", "Order not found.");
    if (cur.status === "paid") throw new AppError("CONFLICT", "This order is already paid.");
    if (cur.status !== "open") throw new AppError("INVALID_TRANSITION", "This order was cancelled.");
    if (cur.outlet !== v.outlet) throw new AppError("VALIDATION", "An order stays with the counter it was opened at.");
    await writeBatch(db, actor, replaceLines(db, v.id, priced, totalKobo, note)).catch((err) => payFailed(db, err, priced));
  };
  if (await orderState(db, v.id)) await update();
  else {
    try {
      await writeBatch(db, actor, [
        ...orderInsert(db, v.id, v.outlet, totalKobo, note, actor.id),
        ...lineInserts(db, v.id, priced),
        activity(db, "pos.order_opened", "pos_order", v.id, `${OUTLETS[v.outlet]} order opened: ${naira(totalKobo)} (unpaid)`),
      ]);
    } catch (err) {
      if (!isUnique(err)) throw err;
      await update();
    }
  }
  const row = await first<{ number: number }>(db, "SELECT number FROM pos_orders WHERE id = ?", v.id);
  return { id: v.id, number: row!.number, totalKobo };
}

export type PaidOrder = { id: string; number: number; receiptNumber: string; totalKobo: number; changeKobo: number | null; alreadyPaid: boolean };

async function paidResult(db: Db, id: string, alreadyPaid: boolean): Promise<PaidOrder> {
  const r = await first<{ number: number; receipt_number: string; total_kobo: number; cash_received_kobo: number | null }>(
    db,
    "SELECT number, receipt_number, total_kobo, cash_received_kobo FROM pos_orders WHERE id = ? AND status IN ('paid', 'void')",
    id,
  );
  if (!r) throw new AppError("CONFLICT", "This order was just changed. Reload and check it.");
  return { id, number: r.number, receiptNumber: r.receipt_number, totalKobo: r.total_kobo, changeKobo: r.cash_received_kobo == null ? null : r.cash_received_kobo - r.total_kobo, alreadyPaid };
}

/**
 * Take payment for the order with this id. With `lines`, the order is created or
 * updated to exactly those lines at today's prices first (what the screen shows),
 * in the same step. Paying the same id again returns the first receipt: a retry
 * after a dropped connection never records a second sale.
 */
export async function payOrder(
  db: Db,
  actor: Actor,
  v: { id: string; outlet?: Outlet; lines?: OrderLine[]; note?: string | null; method: PayMethod; cashReceivedKobo?: number | null },
): Promise<PaidOrder> {
  requireRole(actor, POS_SELLERS);
  if (!(v.method in PAY_METHODS)) throw new AppError("VALIDATION", "Choose how the customer paid.");
  const cur = await orderState(db, v.id);
  if (cur?.status === "paid" || cur?.status === "void") return paidResult(db, v.id, true);
  if (cur?.status === "cancelled") throw new AppError("INVALID_TRANSITION", "This order was cancelled.");
  await assertNotClosed(db, actor.id);

  let totalKobo: number;
  let lines: { menuItemId: string; quantity: number }[];
  const stmts = [];
  const note = v.note?.trim().slice(0, 120) || null;
  if (v.lines) {
    const outlet = cur?.outlet ?? v.outlet;
    if (!outlet) throw new AppError("VALIDATION", "Choose the counter.");
    if (cur && v.outlet && v.outlet !== cur.outlet) throw new AppError("VALIDATION", "An order stays with the counter it was opened at.");
    const p = await price(db, outlet, v.lines);
    totalKobo = p.totalKobo;
    lines = p.priced;
    stmts.push(...(cur ? replaceLines(db, v.id, p.priced, totalKobo, note) : [...orderInsert(db, v.id, outlet, totalKobo, note, actor.id), ...lineInserts(db, v.id, p.priced)]));
  } else {
    if (!cur) throw new AppError("NOT_FOUND", "Order not found.");
    totalKobo = cur.total_kobo;
    lines = await all<{ menuItemId: string; quantity: number }>(db, "SELECT menu_item_id AS menuItemId, quantity FROM pos_order_items WHERE order_id = ?", v.id);
    if (!lines.length) throw new AppError("VALIDATION", "Add at least one item.");
  }
  await checkStock(db, lines);
  const cash = validCash(v.method, totalKobo, v.cashReceivedKobo);
  stmts.push(
    ...payStatements(db, v.id, actor.id, v.method, totalKobo, cash),
    activity(db, "pos.order_paid", "pos_order", v.id, `Sale ${naira(totalKobo)} paid by ${PAY_METHODS[v.method].toLowerCase()}`, { method: v.method, total_kobo: totalKobo }),
  );
  try {
    await writeBatch(db, actor, stmts);
  } catch (err) {
    const now = await orderState(db, v.id);
    if (now?.status === "paid" || now?.status === "void") return paidResult(db, v.id, true);
    if (isUnique(err)) throw new AppError("CONFLICT", "This order was just changed. Try again.");
    await payFailed(db, err, lines);
  }
  return paidResult(db, v.id, false);
}

/** Drop an unpaid order. It stays on record as cancelled. */
export async function cancelOrder(db: Db, actor: Actor, id: string, reason: string | null): Promise<void> {
  requireRole(actor, POS_SELLERS);
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE pos_orders SET status = 'cancelled', closed_by = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), close_reason = ? WHERE id = ? AND status = 'open'")
      .bind(actor.id, reason?.trim().slice(0, 200) || null, id),
    activityIfChanged(db, "pos.order_cancelled", "pos_order", id, `Unpaid order cancelled${reason?.trim() ? `: ${reason.trim()}` : ""}`),
  ]);
  if (!r?.meta.changes) throw new AppError("INVALID_TRANSITION", "Only unpaid orders can be cancelled.");
}

/** A manager reverses a paid sale: reason recorded, stock put back, original kept. */
export async function voidOrder(db: Db, actor: Actor, id: string, reason: string): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  const why = reason.trim();
  if (why.length < 3) throw new AppError("VALIDATION", "Give a reason.");
  const o = await first<{ status: OrderStatus; total_kobo: number; receipt_number: string | null }>(db, "SELECT status, total_kobo, receipt_number FROM pos_orders WHERE id = ?", id);
  if (!o) throw new AppError("NOT_FOUND", "Order not found.");
  if (o.status !== "paid") throw new AppError("INVALID_TRANSITION", "Only paid sales can be voided.");
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE pos_orders SET status = 'void', closed_by = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), close_reason = ? WHERE id = ? AND status = 'paid'")
      .bind(actor.id, why.slice(0, 200), id),
    db
      .prepare(
        `INSERT INTO stock_moves (item_id, change, kind, order_id, staff_id, note)
         SELECT item_id, -sum(change), 'returned', ?1, ?2, 'Sale voided' FROM stock_moves WHERE order_id = ?1 AND kind = 'sold' AND changes() > 0 GROUP BY item_id`,
      )
      .bind(id, actor.id),
    activity(db, "pos.order_voided", "pos_order", id, `Sale ${o.receipt_number} (${naira(o.total_kobo)}) voided: ${why}`),
  ]);
  if (!r?.meta.changes) throw new AppError("CONFLICT", "This sale was just changed. Reload and check it.");
}

// ---------------------------------------------------------------------------
// Reading orders
// ---------------------------------------------------------------------------

export type OrderRow = {
  id: string; number: number; outlet: Outlet; status: OrderStatus; total_kobo: number; method: PayMethod | null; receipt_number: string | null;
  note: string | null; created_at: string; paid_at: string | null; taken_by: string | null; created_by_name: string | null; items: string;
};

const ORDER_SELECT = `SELECT o.id, o.number, o.outlet, o.status, o.total_kobo, o.method, o.receipt_number, o.note, o.created_at, o.paid_at,
  p.full_name AS taken_by, c.full_name AS created_by_name,
  (SELECT group_concat(i.quantity || ' × ' || i.name, ', ') FROM pos_order_items i WHERE i.order_id = o.id) AS items
  FROM pos_orders o LEFT JOIN staff_profiles p ON p.id = o.paid_by LEFT JOIN staff_profiles c ON c.id = o.created_by`;

const sees = (actor: NonNullable<Actor>) => (POS_VIEWERS as readonly StaffRole[]).includes(actor.role);

export type OpenOrder = OrderRow & { lines: OrderLine[] };

export async function openOrders(db: Db, actor: Actor): Promise<OpenOrder[]> {
  requireRole(actor, POS_SELLERS);
  const [orders, lines] = await Promise.all([
    all<OrderRow>(db, `${ORDER_SELECT} WHERE o.status = 'open' ORDER BY o.created_at`),
    all<{ order_id: string; menuItemId: string; quantity: number }>(
      db,
      "SELECT i.order_id, i.menu_item_id AS menuItemId, i.quantity FROM pos_order_items i JOIN pos_orders o ON o.id = i.order_id WHERE o.status = 'open' ORDER BY i.line",
    ),
  ]);
  return orders.map((o) => ({ ...o, lines: lines.filter((l) => l.order_id === o.id).map(({ menuItemId, quantity }) => ({ menuItemId, quantity })) }));
}

export type OrderFilter = { from: string; to: string; method?: PayMethod; status?: OrderStatus; staffId?: string; outlet?: Outlet; q?: string };

export async function listOrders(db: Db, actor: Actor, f: OrderFilter, limit = 200): Promise<OrderRow[]> {
  requireRole(actor, ALL_POS);
  const where = ["o.created_at >= ?", "o.created_at < ?"];
  const params: unknown[] = [dayStart(f.from), dayStart(addDays(f.to, 1))];
  if (!sees(actor)) {
    where.push("(o.paid_by = ? OR o.created_by = ?)");
    params.push(actor.id, actor.id);
  }
  if (f.method) { where.push("o.method = ?"); params.push(f.method); }
  if (f.status) { where.push("o.status = ?"); params.push(f.status); }
  if (f.outlet) { where.push("o.outlet = ?"); params.push(f.outlet); }
  if (f.staffId) { where.push("(o.paid_by = ? OR (o.paid_by IS NULL AND o.created_by = ?))"); params.push(f.staffId, f.staffId); }
  const q = f.q?.trim();
  if (q) {
    const n = Number(q.replace(/^#/, ""));
    where.push(`(o.receipt_number LIKE ? OR ${Number.isInteger(n) && n > 0 ? "o.number = ? OR" : ""} EXISTS (SELECT 1 FROM pos_order_items i WHERE i.order_id = o.id AND i.name LIKE ?))`);
    params.push(`%${q.toUpperCase()}%`, ...(Number.isInteger(n) && n > 0 ? [n] : []), `%${q}%`);
  }
  return all<OrderRow>(db, `${ORDER_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT ${Math.min(limit, 20_000)}`, ...params);
}

export type OrderDetail = OrderRow & {
  lines: { line: number; name: string; category: MenuCategory; unit_price_kobo: number; quantity: number }[];
  cash_received_kobo: number | null; closed_by_name: string | null; closed_at: string | null; close_reason: string | null;
};

export async function getOrder(db: Db, actor: Actor, id: string): Promise<OrderDetail | null> {
  requireRole(actor, ALL_POS);
  const o = await first<OrderDetail & { paid_by: string | null; created_by: string }>(
    db,
    `SELECT o.id, o.number, o.outlet, o.status, o.total_kobo, o.method, o.receipt_number, o.note, o.created_at, o.paid_at, o.cash_received_kobo,
            o.closed_at, o.close_reason, o.paid_by, o.created_by,
            p.full_name AS taken_by, c.full_name AS created_by_name, x.full_name AS closed_by_name, '' AS items
     FROM pos_orders o LEFT JOIN staff_profiles p ON p.id = o.paid_by LEFT JOIN staff_profiles c ON c.id = o.created_by
     LEFT JOIN staff_profiles x ON x.id = o.closed_by WHERE o.id = ?`,
    id,
  );
  if (!o) return null;
  if (!sees(actor) && o.paid_by !== actor.id && o.created_by !== actor.id && o.status !== "open") return null;
  const lines = await all<OrderDetail["lines"][number]>(db, "SELECT line, name, category, unit_price_kobo, quantity FROM pos_order_items WHERE order_id = ? ORDER BY line", id);
  return { ...o, lines };
}

// ---------------------------------------------------------------------------
// Daily closing
// ---------------------------------------------------------------------------

export type ClosingSummary = {
  sales: number; salesKobo: number; byMethod: Record<PayMethod, number>; voids: number; voidsKobo: number; openOrders: number;
};

export async function closingSummary(db: Db, actor: Actor, staffId: string, date = businessDate()): Promise<ClosingSummary> {
  requireRole(actor, ALL_POS);
  if (staffId !== actor.id && !sees(actor)) throw new AppError("FORBIDDEN", "You can only close your own sales.");
  const from = dayStart(date);
  const to = dayStart(addDays(date, 1));
  const [paid, voided, open] = await Promise.all([
    all<{ method: PayMethod; n: number; kobo: number }>(
      db,
      "SELECT method, count(*) AS n, sum(total_kobo) AS kobo FROM pos_orders WHERE status = 'paid' AND paid_by = ? AND paid_at >= ? AND paid_at < ? GROUP BY method",
      staffId, from, to,
    ),
    first<{ n: number; kobo: number }>(
      db,
      "SELECT count(*) AS n, coalesce(sum(total_kobo), 0) AS kobo FROM pos_orders WHERE status = 'void' AND paid_by = ? AND paid_at >= ? AND paid_at < ?",
      staffId, from, to,
    ),
    first<{ n: number }>(db, "SELECT count(*) AS n FROM pos_orders WHERE status = 'open' AND created_by = ?", staffId),
  ]);
  const byMethod: Record<PayMethod, number> = { cash: 0, bank_transfer: 0, pos_terminal: 0 };
  for (const p of paid) byMethod[p.method] = p.kobo;
  return {
    sales: paid.reduce((s, p) => s + p.n, 0),
    salesKobo: paid.reduce((s, p) => s + p.kobo, 0),
    byMethod,
    voids: voided?.n ?? 0,
    voidsKobo: voided?.kobo ?? 0,
    openOrders: open?.n ?? 0,
  };
}

export async function closeDay(db: Db, actor: Actor, v: { countedCashKobo: number; explanation: string | null }): Promise<string> {
  requireRole(actor, POS_SELLERS);
  const date = businessDate();
  const s = await closingSummary(db, actor, actor.id, date);
  if (s.openOrders) throw new AppError("VALIDATION", `${s.openOrders === 1 ? "1 order is" : `${s.openOrders} orders are`} still unpaid. Take payment or cancel ${s.openOrders === 1 ? "it" : "them"} first.`);
  if (!Number.isInteger(v.countedCashKobo) || v.countedCashKobo < 0 || v.countedCashKobo > 10_000_000_000) throw new AppError("VALIDATION", "Enter the cash you counted.");
  const expected = s.byMethod.cash;
  const why = v.explanation?.trim() || null;
  if (v.countedCashKobo !== expected && (!why || why.length < 3)) {
    throw new AppError("VALIDATION", `The cash is ${naira(Math.abs(v.countedCashKobo - expected))} ${v.countedCashKobo < expected ? "short" : "over"}. Say why.`);
  }
  const id = uuid();
  const diff = v.countedCashKobo - expected;
  try {
    await writeBatch(db, actor, [
      db
        .prepare("INSERT INTO pos_closings (id, business_date, staff_id, summary, expected_cash_kobo, counted_cash_kobo, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, date, actor.id, JSON.stringify(s), expected, v.countedCashKobo, why),
      activity(db, "pos.day_closed", "pos_closing", id, `Restaurant & bar sales closed for ${date}: ${naira(s.salesKobo)} sold, cash ${diff === 0 ? "matches" : `${naira(Math.abs(diff))} ${diff < 0 ? "short" : "over"}`}`),
    ]);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "unique") throw new AppError("CONFLICT", "You've already closed today's sales.");
    throw err;
  }
  return id;
}

export async function verifyClosing(db: Db, actor: Actor, id: string, note: string | null): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  const c = await first<{ staff_id: string; verified_at: string | null }>(db, "SELECT staff_id, verified_at FROM pos_closings WHERE id = ?", id);
  if (!c) throw new AppError("NOT_FOUND", "Closing not found.");
  if (c.verified_at) throw new AppError("CONFLICT", "This closing is already signed off.");
  if (c.staff_id === actor.id && actor.role !== "owner") throw new AppError("FORBIDDEN", "Another manager or the owner must sign off your own closing.");
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE pos_closings SET verified_by = ?, verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), verify_note = ? WHERE id = ? AND verified_at IS NULL")
      .bind(actor.id, note?.trim().slice(0, 300) || null, id),
    activityIfChanged(db, "pos.closing_verified", "pos_closing", id, `Restaurant & bar closing signed off${note?.trim() ? `: ${note.trim()}` : ""}`),
  ]);
  if (!r?.meta.changes) throw new AppError("CONFLICT", "This closing is already signed off.");
}

export type ClosingRow = {
  id: string; business_date: string; staff: string; summary: string; expected_cash_kobo: number; counted_cash_kobo: number;
  explanation: string | null; closed_at: string; verified_by_name: string | null; verified_at: string | null; verify_note: string | null; staff_id: string;
};

export async function listClosings(db: Db, actor: Actor, from: string, to: string): Promise<ClosingRow[]> {
  requireRole(actor, ALL_POS);
  return all<ClosingRow>(
    db,
    `SELECT c.id, c.business_date, s.full_name AS staff, c.summary, c.expected_cash_kobo, c.counted_cash_kobo, c.explanation, c.closed_at,
            v.full_name AS verified_by_name, c.verified_at, c.verify_note, c.staff_id
     FROM pos_closings c JOIN staff_profiles s ON s.id = c.staff_id LEFT JOIN staff_profiles v ON v.id = c.verified_by
     WHERE c.business_date BETWEEN ? AND ? ${sees(actor) ? "" : "AND c.staff_id = ?"}
     ORDER BY c.business_date DESC, c.closed_at DESC`,
    from, to, ...(sees(actor) ? [] : [actor.id]),
  );
}
